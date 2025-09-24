-- ML-KEM Post-Quantum Call Encryption Support
-- Adds tables and functions for ML-KEM key exchange and call session management
-- Following FIPS 203 standard for quantum-resistant cryptography

-- Create call_sessions table for ML-KEM encrypted calls
CREATE TABLE IF NOT EXISTS public.call_sessions (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
    ml_kem_parameter_set TEXT NOT NULL CHECK (ml_kem_parameter_set IN ('ML_KEM_1024', 'ML_KEM_768')),
    initiator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- ML-KEM key exchange data (base64 encoded)
    initiator_public_key TEXT NOT NULL,
    recipient_public_key TEXT,
    ciphertext TEXT,
    
    -- Session status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'established', 'failed', 'ended')),
    
    -- Key derivation context
    srtp_key_derived BOOLEAN DEFAULT FALSE,
    sframe_key_derived BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    established_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata for debugging and monitoring
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create call_key_rotations table for forward secrecy
CREATE TABLE IF NOT EXISTS public.call_key_rotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_session_id TEXT NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
    rotation_sequence INTEGER NOT NULL,
    
    -- New ML-KEM key exchange for rotation
    initiator_public_key TEXT NOT NULL,
    recipient_public_key TEXT,
    ciphertext TEXT,
    
    -- Rotation status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'established', 'failed')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    established_at TIMESTAMPTZ,
    
    -- Ensure sequence ordering
    UNIQUE(call_session_id, rotation_sequence)
);

-- Create group_call_sessions table for group calls with ML-KEM
CREATE TABLE IF NOT EXISTS public.group_call_sessions (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ml_kem_parameter_set TEXT NOT NULL CHECK (ml_kem_parameter_set IN ('ML_KEM_1024', 'ML_KEM_768')),
    
    -- Group Call Key (GCK) encrypted for each participant
    group_call_key_encrypted JSONB NOT NULL DEFAULT '{}'::jsonb, -- {user_id: encrypted_gck}
    
    -- Session status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create group_call_participants table
CREATE TABLE IF NOT EXISTS public.group_call_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_call_session_id TEXT NOT NULL REFERENCES public.group_call_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- ML-KEM public key for this participant
    public_key TEXT NOT NULL,
    
    -- Participant status
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'joined', 'left')),
    
    -- Timestamps
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique participation
    UNIQUE(group_call_session_id, user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_sessions_call_id ON public.call_sessions(call_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_initiator_id ON public.call_sessions(initiator_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_recipient_id ON public.call_sessions(recipient_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON public.call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created_at ON public.call_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_call_key_rotations_session_id ON public.call_key_rotations(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_key_rotations_sequence ON public.call_key_rotations(call_session_id, rotation_sequence);

CREATE INDEX IF NOT EXISTS idx_group_call_sessions_call_id ON public.group_call_sessions(call_id);
CREATE INDEX IF NOT EXISTS idx_group_call_sessions_creator_id ON public.group_call_sessions(creator_id);
CREATE INDEX IF NOT EXISTS idx_group_call_sessions_status ON public.group_call_sessions(status);

CREATE INDEX IF NOT EXISTS idx_group_call_participants_session_id ON public.group_call_participants(group_call_session_id);
CREATE INDEX IF NOT EXISTS idx_group_call_participants_user_id ON public.group_call_participants(user_id);

-- Add updated_at triggers
CREATE TRIGGER update_call_sessions_updated_at
    BEFORE UPDATE ON public.call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_call_sessions_updated_at
    BEFORE UPDATE ON public.group_call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_key_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_call_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_sessions
CREATE POLICY "Users can view their own call sessions" ON public.call_sessions
    FOR SELECT USING (
        initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Users can insert call sessions they initiate" ON public.call_sessions
    FOR INSERT WITH CHECK (
        initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Users can update their own call sessions" ON public.call_sessions
    FOR UPDATE USING (
        initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- RLS Policies for call_key_rotations
CREATE POLICY "Users can view key rotations for their call sessions" ON public.call_key_rotations
    FOR SELECT USING (
        call_session_id IN (
            SELECT id FROM public.call_sessions 
            WHERE initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
               OR recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert key rotations for their call sessions" ON public.call_key_rotations
    FOR INSERT WITH CHECK (
        call_session_id IN (
            SELECT id FROM public.call_sessions 
            WHERE initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
               OR recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

CREATE POLICY "Users can update key rotations for their call sessions" ON public.call_key_rotations
    FOR UPDATE USING (
        call_session_id IN (
            SELECT id FROM public.call_sessions 
            WHERE initiator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
               OR recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

-- RLS Policies for group_call_sessions
CREATE POLICY "Users can view group call sessions they participate in" ON public.group_call_sessions
    FOR SELECT USING (
        creator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        id IN (
            SELECT group_call_session_id FROM public.group_call_participants 
            WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert group call sessions they create" ON public.group_call_sessions
    FOR INSERT WITH CHECK (
        creator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Creators can update their group call sessions" ON public.group_call_sessions
    FOR UPDATE USING (
        creator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- RLS Policies for group_call_participants
CREATE POLICY "Users can view participants in their group calls" ON public.group_call_participants
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        group_call_session_id IN (
            SELECT id FROM public.group_call_sessions 
            WHERE creator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );

CREATE POLICY "Users can insert themselves as participants" ON public.group_call_participants
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

CREATE POLICY "Users can update their own participation" ON public.group_call_participants
    FOR UPDATE USING (
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- Function to create a new call session with ML-KEM
CREATE OR REPLACE FUNCTION create_call_session(
    p_call_id TEXT,
    p_recipient_id UUID,
    p_ml_kem_parameter_set TEXT DEFAULT 'ML_KEM_1024',
    p_initiator_public_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id TEXT;
    v_initiator_id UUID;
BEGIN
    -- Get the authenticated user's internal ID
    SELECT id INTO v_initiator_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid();
    
    IF v_initiator_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Generate session ID
    v_session_id := 'cs-' || extract(epoch from now()) || '-' || substr(md5(random()::text), 1, 8);
    
    -- Insert call session
    INSERT INTO public.call_sessions (
        id,
        call_id,
        ml_kem_parameter_set,
        initiator_id,
        recipient_id,
        initiator_public_key,
        status
    ) VALUES (
        v_session_id,
        p_call_id,
        p_ml_kem_parameter_set,
        v_initiator_id,
        p_recipient_id,
        p_initiator_public_key,
        'pending'
    );
    
    RETURN v_session_id;
END;
$$;

-- Function to establish call session (recipient responds with their public key)
CREATE OR REPLACE FUNCTION establish_call_session(
    p_session_id TEXT,
    p_recipient_public_key TEXT,
    p_ciphertext TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_session_record RECORD;
BEGIN
    -- Get the authenticated user's internal ID
    SELECT id INTO v_user_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Get session and verify user is the recipient
    SELECT * INTO v_session_record
    FROM public.call_sessions
    WHERE id = p_session_id AND recipient_id = v_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Call session not found or access denied';
    END IF;
    
    -- Update session with recipient's response
    UPDATE public.call_sessions
    SET 
        recipient_public_key = p_recipient_public_key,
        ciphertext = p_ciphertext,
        status = 'established',
        established_at = NOW()
    WHERE id = p_session_id;
    
    RETURN TRUE;
END;
$$;

-- Function to get active call sessions for a user
CREATE OR REPLACE FUNCTION get_user_call_sessions(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    session_id TEXT,
    call_id TEXT,
    ml_kem_parameter_set TEXT,
    is_initiator BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    established_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Use provided user_id or get from auth
    IF p_user_id IS NULL THEN
        SELECT id INTO v_user_id 
        FROM public.users 
        WHERE auth_user_id = auth.uid();
    ELSE
        v_user_id := p_user_id;
    END IF;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    RETURN QUERY
    SELECT 
        cs.id as session_id,
        cs.call_id,
        cs.ml_kem_parameter_set,
        (cs.initiator_id = v_user_id) as is_initiator,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN cs.recipient_id
            ELSE cs.initiator_id
        END as other_user_id,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN recipient_user.username
            ELSE initiator_user.username
        END as other_user_username,
        CASE 
            WHEN cs.initiator_id = v_user_id THEN recipient_user.display_name
            ELSE initiator_user.display_name
        END as other_user_display_name,
        cs.status,
        cs.created_at,
        cs.established_at
    FROM public.call_sessions cs
    LEFT JOIN public.users initiator_user ON cs.initiator_id = initiator_user.id
    LEFT JOIN public.users recipient_user ON cs.recipient_id = recipient_user.id
    WHERE cs.initiator_id = v_user_id OR cs.recipient_id = v_user_id
    ORDER BY cs.created_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.call_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.call_key_rotations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.group_call_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_call_participants TO authenticated;

GRANT EXECUTE ON FUNCTION create_call_session(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION establish_call_session(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_call_sessions(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.call_sessions IS 'ML-KEM encrypted call sessions for 1:1 voice/video calls';
COMMENT ON TABLE public.call_key_rotations IS 'Key rotation records for forward secrecy in call sessions';
COMMENT ON TABLE public.group_call_sessions IS 'ML-KEM encrypted group call sessions';
COMMENT ON TABLE public.group_call_participants IS 'Participants in group call sessions';

COMMENT ON FUNCTION create_call_session(TEXT, UUID, TEXT, TEXT) IS 'Create a new ML-KEM call session';
COMMENT ON FUNCTION establish_call_session(TEXT, TEXT, TEXT) IS 'Establish call session with recipient response';
COMMENT ON FUNCTION get_user_call_sessions(UUID) IS 'Get call sessions for a user';
-- Voice/Video calling support for QryptChat
-- Adds voice_calls table for call history and state management

-- Create voice_calls table
CREATE TABLE IF NOT EXISTS public.voice_calls (
    id TEXT PRIMARY KEY,
    caller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
    status TEXT NOT NULL CHECK (status IN ('ringing', 'connected', 'ended', 'declined', 'missed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_voice_calls_caller_id ON public.voice_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_recipient_id ON public.voice_calls(recipient_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_started_at ON public.voice_calls(started_at);
CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON public.voice_calls(status);

-- Composite index for user call history
CREATE INDEX IF NOT EXISTS idx_voice_calls_user_history ON public.voice_calls(caller_id, recipient_id, started_at DESC);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language plpgsql;

-- Add trigger for voice_calls table
DROP TRIGGER IF EXISTS update_voice_calls_updated_at ON public.voice_calls;
CREATE TRIGGER update_voice_calls_updated_at
    BEFORE UPDATE ON public.voice_calls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own calls (as caller or recipient)
CREATE POLICY "Users can view their own calls" ON public.voice_calls
    FOR SELECT USING (
        caller_id = auth.uid() OR 
        recipient_id = auth.uid() OR
        caller_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- Policy: Users can insert calls they initiate
CREATE POLICY "Users can insert calls they initiate" ON public.voice_calls
    FOR INSERT WITH CHECK (
        caller_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- Policy: Users can update calls they participate in
CREATE POLICY "Users can update calls they participate in" ON public.voice_calls
    FOR UPDATE USING (
        caller_id = auth.uid() OR 
        recipient_id = auth.uid() OR
        caller_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) OR
        recipient_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- Function to get user call history
CREATE OR REPLACE FUNCTION get_user_call_history(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    id TEXT,
    call_type TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    is_caller BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    other_user_avatar_url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.id,
        vc.call_type,
        vc.status,
        vc.started_at,
        vc.connected_at,
        vc.ended_at,
        vc.duration_seconds,
        (vc.caller_id = p_user_id) as is_caller,
        CASE 
            WHEN vc.caller_id = p_user_id THEN vc.recipient_id
            ELSE vc.caller_id
        END as other_user_id,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.username
            ELSE caller_user.username
        END as other_user_username,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.display_name
            ELSE caller_user.display_name
        END as other_user_display_name,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.avatar_url
            ELSE caller_user.avatar_url
        END as other_user_avatar_url
    FROM public.voice_calls vc
    LEFT JOIN public.users caller_user ON vc.caller_id = caller_user.id
    LEFT JOIN public.users recipient_user ON vc.recipient_id = recipient_user.id
    WHERE vc.caller_id = p_user_id OR vc.recipient_id = p_user_id
    ORDER BY vc.started_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to get active calls for a user
CREATE OR REPLACE FUNCTION get_user_active_calls(p_user_id UUID)
RETURNS TABLE (
    id TEXT,
    call_type TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    is_caller BOOLEAN,
    other_user_id UUID,
    other_user_username TEXT,
    other_user_display_name TEXT,
    other_user_avatar_url TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vc.id,
        vc.call_type,
        vc.status,
        vc.started_at,
        (vc.caller_id = p_user_id) as is_caller,
        CASE 
            WHEN vc.caller_id = p_user_id THEN vc.recipient_id
            ELSE vc.caller_id
        END as other_user_id,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.username
            ELSE caller_user.username
        END as other_user_username,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.display_name
            ELSE caller_user.display_name
        END as other_user_display_name,
        CASE 
            WHEN vc.caller_id = p_user_id THEN recipient_user.avatar_url
            ELSE caller_user.avatar_url
        END as other_user_avatar_url
    FROM public.voice_calls vc
    LEFT JOIN public.users caller_user ON vc.caller_id = caller_user.id
    LEFT JOIN public.users recipient_user ON vc.recipient_id = recipient_user.id
    WHERE (vc.caller_id = p_user_id OR vc.recipient_id = p_user_id)
    AND vc.status IN ('ringing', 'connected')
    ORDER BY vc.started_at DESC;
END;
$$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.voice_calls TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_call_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_calls(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.voice_calls IS 'Voice and video call records for call history and state management';
COMMENT ON FUNCTION get_user_call_history(UUID, INTEGER) IS 'Get call history for a user with other participant details';
COMMENT ON FUNCTION get_user_active_calls(UUID) IS 'Get currently active calls for a user';
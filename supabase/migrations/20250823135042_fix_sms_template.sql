-- Fix SMS Template Configuration
-- This migration addresses the malformed SMS verification code template

-- Note: SMS templates are typically configured in the Supabase dashboard under Authentication > Templates
-- However, we can document the correct template format here for reference

-- The SMS template should use the following format:
-- "Your QryptChat verification code is {{ .Code }}. This code expires in 10 minutes."

-- Create a function to validate SMS template format
CREATE OR REPLACE FUNCTION validate_sms_template(template_text TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if template contains proper variable substitution
    -- Should contain {{ .Code }} not {{ .Code }}
    IF template_text LIKE '%{{ .Code }}%' THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a table to store SMS template configurations
CREATE TABLE IF NOT EXISTS sms_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_type TEXT NOT NULL CHECK (template_type IN ('phone_verification', 'phone_change')),
    template_content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(template_type)
);

-- Insert default SMS templates
INSERT INTO sms_templates (template_type, template_content) VALUES
('phone_verification', 'Your QryptChat verification code is {{ .Code }}. This code expires in 10 minutes.'),
('phone_change', 'Your QryptChat phone change verification code is {{ .Code }}. This code expires in 10 minutes.')
ON CONFLICT (template_type) DO UPDATE SET
    template_content = EXCLUDED.template_content,
    updated_at = NOW();

-- Create trigger for updated_at
CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON sms_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to get active SMS template
CREATE OR REPLACE FUNCTION get_sms_template(template_type_param TEXT)
RETURNS TEXT AS $$
DECLARE
    template_content TEXT;
BEGIN
    SELECT st.template_content INTO template_content
    FROM sms_templates st
    WHERE st.template_type = template_type_param
    AND st.is_active = TRUE
    LIMIT 1;
    
    RETURN COALESCE(template_content, 'Your verification code is {{ .Code }}');
END;
$$ LANGUAGE plpgsql;

-- Add RLS policy for sms_templates
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- Only service role can manage SMS templates
CREATE POLICY "Service role can manage SMS templates" ON sms_templates
    FOR ALL USING (auth.role() = 'service_role');

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sms_templates_type_active ON sms_templates(template_type, is_active);

-- Add comment explaining the template fix
COMMENT ON TABLE sms_templates IS 'Stores SMS template configurations to fix malformed template issues. Templates should use {{ .Code }} syntax for proper variable substitution.';
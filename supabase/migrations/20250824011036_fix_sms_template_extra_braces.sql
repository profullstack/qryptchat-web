-- Fix SMS Template Extra Braces Issue
-- This migration addresses the SMS template showing extra "}}" characters
-- The issue is likely in the Supabase Auth configuration where the template has malformed syntax

-- Update the SMS templates to ensure proper formatting
UPDATE sms_templates 
SET template_content = 'Your code is {{ .Code }}'
WHERE template_type = 'phone_verification' 
AND template_content LIKE '%}}}}%';

-- Also update any templates that might have the old malformed syntax
UPDATE sms_templates 
SET template_content = 'Your code is {{ .Code }}'
WHERE template_type = 'phone_verification' 
AND (template_content LIKE '%Your code is {{ .Code }}}}%' OR template_content LIKE '%}}}}%');

-- Ensure the phone_change template is also correct
UPDATE sms_templates 
SET template_content = 'Your QryptChat phone change verification code is {{ .Code }}. This code expires in 10 minutes.'
WHERE template_type = 'phone_change' 
AND template_content LIKE '%}}}}%';

-- Insert or update the correct templates
INSERT INTO sms_templates (template_type, template_content) VALUES
('phone_verification', 'Your code is {{ .Code }}'),
('phone_change', 'Your QryptChat phone change verification code is {{ .Code }}. This code expires in 10 minutes.')
ON CONFLICT (template_type) DO UPDATE SET
    template_content = EXCLUDED.template_content,
    updated_at = NOW()
WHERE sms_templates.template_content != EXCLUDED.template_content;

-- Add a function to validate and clean SMS templates
CREATE OR REPLACE FUNCTION clean_sms_template(template_text TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Remove any extra closing braces that might cause the issue
    -- Replace patterns like "{{ .Code }}}}" with "{{ .Code }}"
    RETURN regexp_replace(template_text, '\{\{\s*\.Code\s*\}\}+', '{{ .Code }}', 'g');
END;
$$ LANGUAGE plpgsql;

-- Clean any existing malformed templates
UPDATE sms_templates 
SET template_content = clean_sms_template(template_content)
WHERE template_content ~ '\{\{\s*\.Code\s*\}\}+';

-- Add a comment explaining the fix
COMMENT ON FUNCTION clean_sms_template IS 'Cleans SMS templates by removing extra closing braces that cause malformed output like "Your code is 123456}}"';
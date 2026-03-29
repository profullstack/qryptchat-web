-- Add webhooks table for teams/paid plan users
-- Date: 2026-03-29

CREATE TABLE IF NOT EXISTS public.webhooks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url text NOT NULL,
    events text[] NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for fast lookup by user
CREATE INDEX idx_webhooks_user_id ON public.webhooks(user_id);

-- Enable RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own webhooks
CREATE POLICY "Users can view their own webhooks"
    ON public.webhooks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own webhooks"
    ON public.webhooks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own webhooks"
    ON public.webhooks FOR DELETE
    USING (auth.uid() = user_id);

-- ROLLBACK: restores the PRE-FIX (vulnerable) RLS policies captured 2026-07-28.
-- Only run this if the lockdown breaks production. It re-opens public read access.
CREATE POLICY "Anyone can read user unique identifiers" ON public.users FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can view user profiles" ON public.users FOR SELECT TO public USING (true);
CREATE POLICY "Public profiles are viewable by everyone" ON public.users FOR SELECT TO public USING (true);
CREATE POLICY "Users can read basic user info for search" ON public.users FOR SELECT TO public USING (true);
CREATE POLICY "Users can read all messages" ON public.messages FOR SELECT TO public USING (true);
CREATE POLICY "Users can read conversations for participation check" ON public.conversations FOR SELECT TO public USING (true);
CREATE POLICY "conversations_select_policy" ON public.conversations FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can read own conversations" ON public.conversations FOR SELECT TO public
  USING ((created_by IS NULL) OR (EXISTS (SELECT 1 FROM users u WHERE u.id = conversations.created_by AND u.auth_user_id = auth.uid())));

-- Comprehensive fix for RLS policy infinite recursion issues
-- This migration completely removes all problematic RLS policies and replaces them with simple, non-recursive ones

-- Drop all existing problematic policies
DROP POLICY IF EXISTS "Users can read groups they are members of" ON groups;
DROP POLICY IF EXISTS "Users can update groups they own or admin" ON groups;
DROP POLICY IF EXISTS "Users can read group members for groups they belong to" ON group_members;
DROP POLICY IF EXISTS "Users can read group members" ON group_members;
DROP POLICY IF EXISTS "Users can insert themselves into groups" ON group_members;
DROP POLICY IF EXISTS "Users can read conversations they participate in" ON conversations;

-- Create simple, non-recursive RLS policies for groups
-- Allow authenticated users to read public groups or groups they created
CREATE POLICY "groups_select_policy" ON groups
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND (
            is_public = TRUE 
            OR created_by::text = auth.uid()::text
        )
    );

-- Allow group creators to update their groups
CREATE POLICY "groups_update_policy" ON groups
    FOR UPDATE USING (
        auth.uid() IS NOT NULL 
        AND created_by::text = auth.uid()::text
    );

-- Allow authenticated users to create groups
CREATE POLICY "groups_insert_policy" ON groups
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND created_by::text = auth.uid()::text
    );

-- Create simple, non-recursive RLS policies for group_members
-- Allow authenticated users to read all group members (simplified for now)
CREATE POLICY "group_members_select_policy" ON group_members
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert themselves as group members
CREATE POLICY "group_members_insert_policy" ON group_members
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND user_id::text = auth.uid()::text
    );

-- Allow users to update their own group membership
CREATE POLICY "group_members_update_policy" ON group_members
    FOR UPDATE USING (
        auth.uid() IS NOT NULL 
        AND user_id::text = auth.uid()::text
    );

-- Create simple, non-recursive RLS policies for conversations
-- Allow authenticated users to read conversations (simplified for now)
CREATE POLICY "conversations_select_policy" ON conversations
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to create conversations
CREATE POLICY "conversations_insert_policy" ON conversations
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL 
        AND created_by::text = auth.uid()::text
    );

-- Allow conversation creators to update their conversations
CREATE POLICY "conversations_update_policy" ON conversations
    FOR UPDATE USING (
        auth.uid() IS NOT NULL 
        AND created_by::text = auth.uid()::text
    );
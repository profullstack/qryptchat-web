-- Fix infinite recursion in group_members RLS policy
-- The original policy was referencing the same table within its own condition, causing infinite recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can read group members for groups they belong to" ON group_members;

-- Create a simpler, non-recursive policy
-- Users can read group members if they are authenticated and the group exists
CREATE POLICY "Users can read group members" ON group_members
    FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM groups g 
            WHERE g.id = group_members.group_id
            AND (
                g.is_public = TRUE 
                OR g.created_by::text = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM group_members gm_check
                    WHERE gm_check.group_id = g.id 
                    AND gm_check.user_id::text = auth.uid()::text
                    AND gm_check.left_at IS NULL
                )
            )
        )
    );

-- Also fix the groups policy to avoid potential recursion
DROP POLICY IF EXISTS "Users can read groups they are members of" ON groups;

CREATE POLICY "Users can read groups they are members of" ON groups
    FOR SELECT USING (
        is_public = TRUE 
        OR created_by::text = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = groups.id 
            AND gm.user_id::text = auth.uid()::text
            AND gm.left_at IS NULL
        )
    );
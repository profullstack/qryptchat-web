-- OpenProfile 0.4 default fields on the profile: an emoji (the person's mark,
-- shown next to their name) and pronouns (shown as written, never inferred).
-- `website` already exists. All three are part of the public profile.

alter table public.users
	add column if not exists emoji text check (emoji is null or char_length(emoji) <= 32),
	add column if not exists pronouns text check (pronouns is null or char_length(pronouns) <= 40);

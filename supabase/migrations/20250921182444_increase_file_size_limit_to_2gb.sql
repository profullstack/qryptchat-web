-- Increase file size limit for encrypted-files bucket to 2GB
UPDATE storage.buckets
SET file_size_limit = 2147483648
WHERE id = 'encrypted-files';
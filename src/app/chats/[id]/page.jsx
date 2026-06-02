'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
export default function ChatRedirectPage() {
  const router = useRouter();
  const { id } = useParams();
  useEffect(() => { router.replace(`/chat?conversation=${id}`); }, [id]);
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>;
}

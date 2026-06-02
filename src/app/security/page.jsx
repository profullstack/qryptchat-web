export default function SecurityPage() {
  return (
    <div className="container" style={{padding: '4rem 0'}}>
      <h1 style={{fontSize: '2rem', fontWeight: 800, marginBottom: '1.5rem'}}>Security</h1>
      <p>QryptChat uses ML-KEM-1024 (CRYSTALS-Kyber) for key encapsulation and CRYSTALS-Dilithium for digital signatures — both NIST-approved post-quantum algorithms.</p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { ApiResponse } from '@job-program/shared';

const apiBaseUrl = window.api?.apiBaseUrl ?? 'http://localhost:3000';

interface HealthData {
  status: string;
  timestamp: string;
}

function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/health`)
      .then((res) => res.json() as Promise<ApiResponse<HealthData>>)
      .then((res) => setHealth(res.data ?? null))
      .catch(() => setError('서버에 연결할 수 없습니다.'));
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>일자리사업 행정자동화 플랫폼</h1>
      {health && (
        <p>
          서버 연결 상태: {health.status} ({health.timestamp})
        </p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </main>
  );
}

export default App;

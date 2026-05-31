import { useState, useCallback } from 'react';
import axios from 'axios';

export function useShopee() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (method, path, params = {}, body = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios({
        method,
        url: path,
        params: method === 'GET' ? params : undefined,
        data: method !== 'GET' ? body : undefined,
        withCredentials: true,
      });
      return response.data;
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError({ message, platform: 'shopee', code: err.response?.data?.code });
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, request };
}

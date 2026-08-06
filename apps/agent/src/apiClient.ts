import axios from 'axios';
import { config } from './config';

// StokPilot API'ye giden tüm istekler bu instance üzerinden gider.
// Her istekte Agent kimlik header'ları (X-Agent-Id / X-Agent-Key) eklenir.
export const apiClient = axios.create({
  baseURL: config.STOKPILOT_API_URL,
  timeout: 15_000,
});

apiClient.interceptors.request.use((req) => {
  // axios v1: req.headers her zaman tanımlı bir AxiosHeaders örneğidir.
  req.headers.set('X-Agent-Id', config.AGENT_ID);
  req.headers.set('X-Agent-Key', config.AGENT_API_KEY);
  return req;
});

'use client';

import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/hooks/useAuth';

interface SubmitFeedbackPayload {
  subject: string;
  message: string;
}

/**
 * POST /feedback — yalnızca tek şubeli (STARTER) PATRON. Backend @Roles(PATRON)
 * + planId kontrolüyle zaten reddediyor; buradaki onError bunun (normalde bu
 * sayfaya hiç gelinmemesi gereken, savunma amaçlı) kullanıcı tarafı karşılığı.
 */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (dto: SubmitFeedbackPayload) =>
      api.post('/feedback', dto).then((r) => r.data),
    onSuccess: () => toast.success('Geri bildiriminiz için teşekkürler'),
    onError: (error: unknown) => toast.error(getApiErrorMessage(error)),
  });
}

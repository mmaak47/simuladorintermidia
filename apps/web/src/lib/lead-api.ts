import { useLeadSessionStore } from '@/store/lead-session-store';

interface SubmitLeadParams {
  name: string;
  company?: string;
  email?: string;
  whatsapp: string;
  pointName?: string;
  source: 'gate' | 'image_export' | 'video_request' | 'whatsapp_video';
}

export async function submitLead(params: SubmitLeadParams) {
  const session = useLeadSessionStore.getState();

  await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      company: params.company ?? '',
      email: params.email ?? '',
      whatsapp: params.whatsapp,
      pointName: params.pointName ?? '',
      pointsSimulated: session.simulationsCount,
      creativeUploaded: session.creativeUploaded,
      videoRequest: session.videoRequest,
      imageExport: session.imageExport,
      source: params.source,
      sessionId: session.sessionId,
      status: 'new',
    }),
  });
}

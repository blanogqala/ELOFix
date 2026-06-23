import FingerprintJS from '@fingerprintjs/fingerprintjs';

let agentPromise: ReturnType<typeof FingerprintJS.load> | null = null;

export async function collectDeviceFingerprints(): Promise<{
  deviceFingerprint: string;
  browserFingerprint?: string;
}> {
  if (!agentPromise) {
    agentPromise = FingerprintJS.load();
  }
  const agent = await agentPromise;
  const result = await agent.get();
  return {
    deviceFingerprint: result.visitorId,
    browserFingerprint: result.visitorId,
  };
}

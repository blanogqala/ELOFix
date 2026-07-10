let agentPromise: ReturnType<Awaited<typeof import('@fingerprintjs/fingerprintjs')>['default']['load']> | null = null;

export async function collectDeviceFingerprints(): Promise<{
  deviceFingerprint: string;
  browserFingerprint?: string;
}> {
  if (!agentPromise) {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default;
    agentPromise = FingerprintJS.load();
  }
  const agent = await agentPromise;
  const result = await agent.get();
  return {
    deviceFingerprint: result.visitorId,
    browserFingerprint: result.visitorId,
  };
}

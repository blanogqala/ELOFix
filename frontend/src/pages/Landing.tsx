import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import {
  HeroSection,
  DualPathSection,
  CategoriesSection,
  HowItWorksSection,
  PlatformFeaturesSection,
  TrustSection,
  SupplierShowcaseSection,
  SupplierPartnershipSection,
  // ProviderCTASection,
  // TestimonialsSection,
  FAQSection,
  FinalCTASection,
} from '@/components/landing';

export default function Landing() {
  const location = useLocation();

  useEffect(() => {
    const id = location.hash?.replace(/^#/, '');
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <DualPathSection />
        <CategoriesSection />
        <HowItWorksSection />
        <PlatformFeaturesSection />
        <TrustSection />
        <SupplierShowcaseSection />
        {/* <ProviderCTASection /> */}
        <SupplierPartnershipSection />
        {/* <TestimonialsSection /> */}
        <FAQSection />
        <FinalCTASection />
      </main>
      <Footer />
    </div>
  );
}

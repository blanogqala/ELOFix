import { useState } from 'react';
import { Mail, MapPin } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LandingSection } from '@/components/landing/LandingSection';
import { useToast } from '@/hooks/use-toast';
import { postContactForm } from '@/lib/api/contact';
import { COMPANY, CONTACT_EMAILS, formatRegisteredAddress } from '@/lib/company';

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  cellphone: '',
  message: '',
};

function ContactCard({
  icon: Icon,
  title,
  accent = 'primary',
  children,
}: {
  icon: typeof Mail;
  title: string;
  accent?: 'primary' | 'accent';
  children: React.ReactNode;
}) {
  const iconWrapClass =
    accent === 'accent'
      ? 'bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground'
      : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground';

  return (
    <article className="landing-card group relative overflow-hidden rounded-2xl border-2 border-border/80 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg md:p-8">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-110" />
      <div className="relative">
        <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${iconWrapClass}`}>
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {children}
      </div>
    </article>
  );
}

export default function ContactPage() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const updateField = (field: keyof typeof INITIAL_FORM, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const payload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      cellphone: formData.cellphone.trim(),
      message: formData.message.trim(),
    };

    if (!payload.firstName || !payload.lastName || !payload.email || !payload.cellphone || !payload.message) {
      toast({
        title: 'Missing information',
        description: 'Please complete all fields before sending your message.',
        variant: 'destructive',
      });
      return;
    }

    if (payload.message.length < 10) {
      toast({
        title: 'Message too short',
        description: 'Please tell us a little more about how we can help you.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await postContactForm(payload);
      setFormData(INITIAL_FORM);
      toast({
        title: 'Message sent',
        description: `Your enquiry has been sent to ${COMPANY.supportEmail}. We will get back to you soon.`,
      });
    } catch (error) {
      toast({
        title: 'Could not send message',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <section className="relative scroll-mt-20 overflow-hidden">
          <div className="landing-hero-bg absolute inset-0" aria-hidden />
          <div className="landing-hero-overlay absolute inset-0" aria-hidden />

          <div className="container relative z-10 py-14 md:py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="landing-fade-in landing-delay-1 mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Get in touch
              </p>
              <h1 className="landing-fade-in landing-delay-2 mb-5 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
                Contact{' '}
                <span className="bg-gradient-to-r from-accent via-amber-300 to-accent bg-clip-text text-transparent">
                  EloFix
                </span>
              </h1>
              <p className="landing-fade-in landing-delay-3 mx-auto max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
                {COMPANY.operatorStatement} Send us a message for general enquiries, or use the direct contact details
                below for legal and partnership support.
              </p>
            </div>
          </div>
        </section>

        <LandingSection className="bg-accent/20 backdrop-blur-sm" reveal={false}>
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="lg:col-span-3">
              <ContactCard icon={Mail} title="General Contact Form" accent="primary">
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  Complete the form below and your enquiry will be sent to our general contact team at{' '}
                  <a href={`mailto:${COMPANY.supportEmail}`} className="font-medium text-primary hover:underline">
                    {COMPANY.supportEmail}
                  </a>
                  .
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-first-name">Name</Label>
                      <Input
                        id="contact-first-name"
                        value={formData.firstName}
                        onChange={(event) => updateField('firstName', event.target.value)}
                        placeholder="Enter your name"
                        autoComplete="given-name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-last-name">Surname</Label>
                      <Input
                        id="contact-last-name"
                        value={formData.lastName}
                        onChange={(event) => updateField('lastName', event.target.value)}
                        placeholder="Enter your surname"
                        autoComplete="family-name"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        value={formData.email}
                        onChange={(event) => updateField('email', event.target.value)}
                        placeholder="Enter your email"
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-cellphone">Cellphone</Label>
                      <Input
                        id="contact-cellphone"
                        type="tel"
                        value={formData.cellphone}
                        onChange={(event) => updateField('cellphone', event.target.value)}
                        placeholder="Enter your cellphone number"
                        autoComplete="tel"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contact-message">How can we help you?</Label>
                    <Textarea
                      id="contact-message"
                      value={formData.message}
                      onChange={(event) => updateField('message', event.target.value)}
                      placeholder="Tell us how we can help."
                      className="min-h-[160px]"
                      required
                    />
                  </div>

                  <Button type="submit" className="btn-accent w-full sm:w-auto" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send message'}
                  </Button>
                </form>
              </ContactCard>
            </div>

            <div className="space-y-6 lg:col-span-2">
              <ContactCard icon={Mail} title="Email Contacts" accent="primary">
                <div className="space-y-4">
                  {CONTACT_EMAILS.map((contact) => (
                    <div key={contact.email} className="border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {contact.label}
                      </p>
                      <a
                        href={`mailto:${contact.email}`}
                        className="mt-1 inline-block break-all text-base font-semibold text-primary hover:underline"
                      >
                        {contact.email}
                      </a>
                    </div>
                  ))}
                </div>
              </ContactCard>

              <ContactCard icon={MapPin} title="Registered / physical business address" accent="accent">
                <p className="text-base leading-relaxed text-muted-foreground">{formatRegisteredAddress()}</p>
                <div className="mt-4 border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Country of domicile
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{COMPANY.country}</p>
                </div>
              </ContactCard>
            </div>
          </div>
        </LandingSection>

        <LandingSection className="border-y border-accent/40 bg-primary/5" reveal={false}>
          <div className="mx-auto max-w-3xl rounded-2xl border border-primary/15 bg-card px-6 py-10 text-center shadow-sm md:px-12 md:py-12">
            <p className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{COMPANY.brandName}</p>
            <p className="mt-2 text-base text-muted-foreground md:text-lg">
              Operated by {COMPANY.legalName}
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              EloFix is the marketplace brand. {COMPANY.legalName} is the legal operator for platform agreements,
              privacy, and business correspondence.
            </p>
          </div>
        </LandingSection>
      </main>

      <Footer />
    </div>
  );
}

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FAQ_ITEMS } from './landingData';
import { LandingSection, SectionHeader } from './LandingSection';

export function FAQSection() {
  return (
    <LandingSection id="faq" className="bg-primary/10 border-y-2 border-accent/60">
      <SectionHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Everything you need to know about services, materials, payments, and partnerships."
      />

      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="rounded-2xl border border-border/70 bg-card px-6 shadow-sm">
          {FAQ_ITEMS.map((item, index) => (
            <AccordionItem key={item.question} value={`item-${index}`} className="border-border/60">
              <AccordionTrigger className="text-left text-base hover:no-underline md:text-[15px]">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </LandingSection>
  );
}

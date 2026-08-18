import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getCategories } from '@/lib/api/categories';
import { Category } from '@/types';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LandingSection, SectionHeader } from './LandingSection';

export function CategoriesSection() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setCategories(await getCategories());
      } catch {
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <LandingSection id="categories" className="border-y border-accent/60 bg-accent/20 backdrop-blur-sm">
      <SectionHeader
        eyebrow="Maintenance services"
        title="Browse service categories"
        description="Select a listed category to start a service request. Labour is quotation-based and shown in South African Rand (ZAR)."
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {categories.map((category, index) => (
            <button
              key={category.id}
              type="button"
              onClick={() => navigate(`/user/request/service?category=${category.id}`)}
              className={cn(
                'landing-card group flex flex-col items-center rounded-2xl border-2 border-accent bg-card p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-md sm:p-6',
                'landing-stagger',
              )}
              style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
            >
              <div className="mb-3 text-3xl transition-transform duration-300 group-hover:scale-110 sm:text-4xl">
                {category.icon}
              </div>
              <h3 className="mb-1 text-sm font-semibold sm:text-base">{category.name}</h3>
              <p className="line-clamp-2 text-xs text-muted-foreground">{category.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">Service categories will appear here soon.</p>
      )}

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={() => navigate('/user/request/service')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-accent"
        >
          View all services
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </LandingSection>
  );
}

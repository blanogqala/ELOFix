import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSpecials, getSpecialsByCategory } from '@/lib/api/specials';
import { Special } from '@/types';
import { ChevronLeft, ChevronRight, Clock, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';

interface SpecialsCarouselProps {
  category?: string;
}

export function SpecialsCarousel({ category }: SpecialsCarouselProps) {
  const navigate = useNavigate();
  const [specials, setSpecials] = useState<Special[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadSpecials = useCallback(async () => {
    try {
      const data = category ? await getSpecialsByCategory(category) : await getSpecials();
      setSpecials(data);
    } catch (error) {
      console.error('Failed to load specials:', error);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void loadSpecials();
  }, [loadSpecials]);

  // Auto-slide every 5 seconds
  useEffect(() => {
    if (specials.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % specials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [specials.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + specials.length) % specials.length);
  }, [specials.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % specials.length);
  }, [specials.length]);

  const handleSpecialClick = (special: Special) => {
    // Navigate to supplier catalog filtered by specials
    navigate(`/user/request?category=${special.category}&supplier=${special.supplierId}&specials=true`);
  };

  const getDaysRemaining = (endDate: string) => {
    const days = differenceInDays(parseISO(endDate), new Date());
    if (days <= 0) return 'Ending today';
    if (days === 1) return 'Ends tomorrow';
    return `Ends in ${days} days`;
  };

  if (isLoading) {
    return (
      <div className="card-elevated overflow-hidden animate-pulse">
        <div className="h-48 bg-muted" />
      </div>
    );
  }

  if (specials.length === 0) {
    return null;
  }

  const currentSpecial = specials[currentIndex];

  return (
    <div className="card-elevated group relative max-w-full min-w-0 overflow-hidden">
      {/* Main Slide */}
      <div 
        className="relative h-48 sm:h-56 cursor-pointer transition-transform duration-300"
        onClick={() => handleSpecialClick(currentSpecial)}
      >
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary/70" />
        
        {/* Content */}
        <div className="relative flex h-full min-w-0 items-center px-4 py-4 sm:px-6">
          <div className="z-10 min-w-0 flex-1 text-white">
            {/* Store Info */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{currentSpecial.supplierLogo}</span>
              <span className="text-sm font-medium opacity-90">{currentSpecial.supplierName}</span>
            </div>
            
            {/* Product Name */}
            <h3 className="text-xl sm:text-2xl font-bold mb-2">
              {currentSpecial.productName}
            </h3>
            
            {/* Price */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl font-bold text-accent">
                ${currentSpecial.specialPrice}
              </span>
              <span className="text-sm line-through opacity-60">
                ${currentSpecial.originalPrice}
              </span>
              <span className="px-2 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded-full">
                -{currentSpecial.discountPercent}%
              </span>
            </div>
            
            {/* Countdown */}
            <div className="flex items-center gap-2 text-sm opacity-80">
              <Clock className="h-4 w-4" />
              <span>{getDaysRemaining(currentSpecial.endDate)}</span>
            </div>
          </div>

          {/* Product Image */}
          <div className="hidden sm:block w-32 h-32 rounded-lg bg-white/10 overflow-hidden">
            <img 
              src={currentSpecial.productImage || '/placeholder.svg'} 
              alt={currentSpecial.productName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* "Special" Tag */}
        <div className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1 bg-accent text-accent-foreground text-xs font-bold rounded-full">
          <Tag className="h-3 w-3" />
          SPECIAL
        </div>
      </div>

      {/* Navigation Arrows */}
      {specials.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {specials.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {specials.map((_, index) => (
            <button
              key={index}
              onClick={(e) => { e.stopPropagation(); goToSlide(index); }}
              className={cn(
                "h-2 rounded-full transition-all",
                index === currentIndex 
                  ? "w-6 bg-white" 
                  : "w-2 bg-white/40 hover:bg-white/60"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

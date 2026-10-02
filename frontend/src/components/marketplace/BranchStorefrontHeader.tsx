import { Badge } from '@/components/ui/badge';
import { resolveUploadUrl } from '@/lib/uploadUrl';
import { ExternalLink, Mail, MapPin, Phone, Store, Truck } from 'lucide-react';

export function BranchStorefrontHeader({
  logo,
  displayName,
  address,
  city,
  area,
  phone,
  email,
  websiteUrl,
  hasDelivery,
}: {
  logo?: string | null;
  displayName: string;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  hasDelivery?: boolean;
}) {
  const logoUrl = logo ? resolveUploadUrl(logo) : '';
  const place = [address, area, city].map((part) => (part || '').trim()).filter(Boolean);
  const uniquePlace = [...new Set(place)];
  const phoneText = (phone || '').trim();
  const emailText = (email || '').trim();
  const website = (websiteUrl || '').trim();
  const websiteLabel = website.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  return (
    <div className="rounded-xl border-2 border-primary/80 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Store className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 break-words text-lg font-semibold leading-tight sm:text-xl">{displayName}</h2>
            {hasDelivery !== undefined && (
              <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                <Truck className="h-3 w-3" />
                {hasDelivery ? 'Delivery available' : 'Pickup only'}
              </Badge>
            )}
          </div>
          {uniquePlace.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{uniquePlace.join(', ')}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {phoneText && (
              <a href={`tel:${phoneText}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {phoneText}
              </a>
            )}
            {emailText && (
              <a href={`mailto:${emailText}`} className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{emailText}</span>
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{websiteLabel || website}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

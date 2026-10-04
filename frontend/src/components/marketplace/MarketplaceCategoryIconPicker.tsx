import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
  MarketplaceCategoryIcon,
  normalizeMarketplaceIconKey,
} from './marketplaceCategoryIcons';
import {
  isKnownMarketplaceIcon,
  marketplaceIconLabel,
  searchMarketplaceIcons,
} from './marketplaceIconCatalog';

export function MarketplaceCategoryIconPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState(() => marketplaceIconLabel(value) || value);
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const key = normalizeMarketplaceIconKey(query);
  const known = isKnownMarketplaceIcon(key);
  const options = searchMarketplaceIcons(query);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const select = (choice: { value: string; label: string }) => {
    setQuery(choice.label);
    onChange(choice.value);
    setListOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Icon (optional)</Label>
      <div>
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={`${id}-list`}
          placeholder="Search or type an icon..."
          value={query}
          autoComplete="off"
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onChange(normalizeMarketplaceIconKey(next) ?? '');
            setListOpen(true);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setListOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setListOpen(true);
              setActiveIndex((index) => (listOpen ? Math.min(Math.max(options.length - 1, 0), index + 1) : 0));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && listOpen && options[activeIndex]) {
              event.preventDefault();
              select(options[activeIndex]);
            } else if (event.key === 'Escape' && listOpen) {
              event.preventDefault();
              event.stopPropagation();
              setListOpen(false);
            }
          }}
        />
        {listOpen ? (
          <Command
            shouldFilter={false}
            value={options[activeIndex]?.value}
            className="mt-1 w-full overflow-hidden rounded-md border border-input bg-popover shadow-md"
          >
            <CommandList id={`${id}-list`} className="max-h-48">
              {options.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  No matching icon. A generic icon will be used.
                </p>
              ) : (
                options.map((option, index) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => select(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <MarketplaceCategoryIcon icon={option.value} className="h-4 w-4 shrink-0" />
                    <span>{option.label}</span>
                  </CommandItem>
                ))
              )}
            </CommandList>
          </Command>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
          <MarketplaceCategoryIcon icon={key} className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {!key
            ? 'Generic category icon'
            : known
              ? marketplaceIconLabel(key)
              : 'No matching icon — a generic icon will be used.'}
        </p>
        {key ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              onChange('');
            }}
          >
            Remove icon
          </Button>
        ) : null}
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type MaterialsTabId = 'pending' | 'suggestions';

interface MaterialTabsProps {
  activeTab: MaterialsTabId;
  onTabChange: (tab: MaterialsTabId) => void;
  suggestionCount: number;
}

export function MaterialTabs({ activeTab, onTabChange, suggestionCount }: MaterialTabsProps) {
  return (
    <div
      className="inline-flex rounded-lg border border-border p-1 bg-muted/30 transition-colors"
      role="tablist"
      aria-label="Materials views"
    >
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === 'pending'}
        size="sm"
        variant={activeTab === 'pending' ? 'default' : 'ghost'}
        className="h-8 transition-colors duration-150"
        onClick={() => onTabChange('pending')}
      >
        Pending orders
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={activeTab === 'suggestions'}
        size="sm"
        variant={activeTab === 'suggestions' ? 'default' : 'ghost'}
        className="h-8 gap-2 transition-colors duration-150"
        onClick={() => onTabChange('suggestions')}
      >
        Customer suggestions
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
          {suggestionCount}
        </Badge>
      </Button>
    </div>
  );
}

import { useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const intentId = searchParams.get('intentId') || '';

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-muted-foreground" />
              Payment cancelled
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You cancelled checkout before completing payment. No charge was made.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/user/dashboard">Dashboard</Link>
              </Button>
              {intentId && (
                <Button asChild>
                  <Link to={`/payments/return?intentId=${encodeURIComponent(intentId)}`}>
                    Check payment status
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EloFixLogo } from '@/components/EloFixLogo';

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="mb-8">
        <EloFixLogo variant="dark" className="h-16" />
      </div>
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground">
          You do not have permission to view this page. If you believe this is a mistake,
          please sign in with the correct account or contact support.
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button asChild variant="outline">
            <Link to="/login">Go to login</Link>
          </Button>
          <Button asChild className="btn-accent">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}


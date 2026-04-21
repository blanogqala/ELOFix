import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { getCategories } from '@/lib/api/categories';
import { Category } from '@/types';
import { 
  Shield, 
  CreditCard, 
  BarChart3, 
  ArrowRight, 
  CheckCircle2,
  Star,
  Clock,
  Users
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setCategories(await getCategories());
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="hero-section text-primary-foreground py-16 md:py-24 lg:py-32">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Find Trusted Maintenance Professionals Near You
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
              Connect with verified service providers for plumbing, electrical, tiling, cleaning, and more. 
              Get instant quotes and secure payments.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="btn-accent text-lg h-14 px-8"
                onClick={() => navigate('/user/request')}
              >
                Request a Service
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg h-14 px-8 bg-accent/80 border-white/20 text-white hover:bg-white/20"
                onClick={() => navigate('/register?role=provider')}
              >
                Become a Provider
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-accent/90 border-b border-border ">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-2">10K+</div>
              <div className="text-sm text-muted-foreground">Active Providers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-2">50K+</div>
              <div className="text-sm text-muted-foreground">Jobs Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-2">4.8★</div>
              <div className="text-sm text-muted-foreground">Average Rating</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary mb-2">24/7</div>
              <div className="text-sm text-muted-foreground">Support Available</div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section id="categories" className="py-16 md:py-24 border-accent border-b">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-bold mb-4">Our Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Browse through our wide range of maintenance services. All providers are verified and vetted for quality.
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {categories.map((category, index) => (
              <div 
                key={category.id}
                className="category-card animate-slide-up border-accent"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => navigate(`/user/request?category=${category.id}`)}
              >
                <div className="text-4xl mb-3">{category.icon}</div>
                <h3 className="font-semibold text-sm md:text-base mb-1">{category.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{category.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 md:py-24 bg-secondary-foreground/20 border-accent border-b">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get your maintenance needs handled in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center animate-slide-up" style={{ animationDelay: '0ms' }}>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Describe Your Task</h3>
              <p className="text-muted-foreground text-sm">
                Tell us what you need. Upload photos and let our AI help estimate measurements and materials.
              </p>
            </div>

            <div className="text-center animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-accent">2</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Choose a Provider</h3>
              <p className="text-muted-foreground text-sm">
                Compare verified providers based on ratings, price, and availability. View their portfolios.
              </p>
            </div>

            <div className="text-center animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-success">3</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure Payment</h3>
              <p className="text-muted-foreground text-sm">
                Pay securely through the platform. Funds are held safely until you're satisfied with the work.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button 
              size="lg" 
              className="btn-accent"
              onClick={() => navigate('/user/request')}
            >
              Get Started Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-16 md:py-24 border-accent border-b">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-bold mb-4">Why Choose EloFix</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We prioritize your safety, convenience, and satisfaction
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="card-elevated p-6 animate-slide-up border-accent">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Verified Providers</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Every provider goes through a rigorous verification process including ID checks, skill assessments, and background verification.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  ID Verification
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Skill Certification
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Portfolio Review
                </li>
              </ul>
            </div>

            <div className="card-elevated p-6 animate-slide-up border-accent" style={{ animationDelay: '100ms' }}>
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <CreditCard className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure Payments</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Your payment is protected with our escrow system. Funds are released only when you're completely satisfied.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Escrow Protection
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Multiple Payment Options
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Milestone Payments
                </li>
              </ul>
            </div>

            <div className="card-elevated p-6 animate-slide-up border-accent" style={{ animationDelay: '200ms' }}>
              <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Transparent Pricing</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Get detailed quotes upfront with AI-powered estimates. No hidden fees, no surprises.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  AI-Powered Estimates
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Material Cost Breakdown
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Labor Cost Transparency
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-24 bg-accent/20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-bold mb-4">What Our Customers Say</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="card-elevated p-6 border-accent">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">
                "Amazing service! The plumber arrived on time and fixed everything perfectly. The pricing was transparent and fair."
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Sarah Mitchell</p>
                  <p className="text-xs text-muted-foreground">Homeowner</p>
                </div>
              </div>
            </div>

            <div className="card-elevated p-6 border-accent">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">
                "The camera assisted measurement flow saved me so much time. Got an accurate quote and the tiling work was superb!"
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">James Anderson</p>
                  <p className="text-xs text-muted-foreground">Property Manager</p>
                </div>
              </div>
            </div>

            <div className="card-elevated p-6 border-accent">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">
                "As a provider, EloFix has connected me with quality clients. The escrow system builds trust with customers."
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Maria Garcia</p>
                  <p className="text-xs text-muted-foreground">Tile Specialist</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 hero-section text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            Join thousands of satisfied customers and trusted providers. Your next maintenance project is just a few clicks away.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="btn-accent"
              onClick={() => navigate('/user/request')}
            >
              Request a Service
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => navigate('/register?role=provider')}
            >
              Join as Provider
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

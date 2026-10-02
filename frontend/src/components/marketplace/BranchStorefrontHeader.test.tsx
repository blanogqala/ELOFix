import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BranchStorefrontHeader } from './BranchStorefrontHeader';

describe('BranchStorefrontHeader', () => {
  it('renders phone, email, and website actions when contact details exist', () => {
    render(
      <BranchStorefrontHeader
        displayName="BUCO Bellville"
        address="1 Voortrekker Road"
        city="Cape Town"
        area="Bellville"
        phone="0215550101"
        email="bellville@example.com"
        websiteUrl="https://buco.example/bellville"
        hasDelivery
      />
    );
    expect(screen.getByRole('heading', { name: 'BUCO Bellville' })).toBeInTheDocument();
    expect(screen.getByText(/1 Voortrekker Road, Bellville, Cape Town/)).toBeInTheDocument();
    const phone = screen.getByRole('link', { name: /0215550101/ });
    expect(phone).toHaveAttribute('href', 'tel:0215550101');
    const email = screen.getByRole('link', { name: /bellville@example.com/ });
    expect(email).toHaveAttribute('href', 'mailto:bellville@example.com');
    const website = screen.getByRole('link', { name: /buco.example\/bellville/ });
    expect(website).toHaveAttribute('href', 'https://buco.example/bellville');
    expect(website).toHaveAttribute('target', '_blank');
    expect(website).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/delivery available/i)).toBeInTheDocument();
  });

  it('omits missing contact fields without leaving empty links', () => {
    render(<BranchStorefrontHeader displayName="Specialist Tile Store" hasDelivery={false} />);
    expect(screen.getByRole('heading', { name: 'Specialist Tile Store' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/pickup only/i)).toBeInTheDocument();
  });
});

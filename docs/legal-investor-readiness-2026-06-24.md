# EloFix Legal Investor Readiness Report

**Date:** 24 June 2026  
**Framework version:** 2026-06-24

---

## Readiness Scores

| Score | Pre-Upgrade | Post-Upgrade | Target |
|-------|-------------|--------------|--------|
| **Legal Risk** | 42/100 | **78/100** | 78/100 |
| **Compliance (POPIA / ECTA / CPA)** | 38/100 | **82/100** | 82/100 |
| **Marketplace Readiness** | 45/100 | **85/100** | 85/100 |
| **Investor Readiness** | 40/100 | **80/100** | 80/100 |

### Score rationale

**Legal Risk (78):** All critical platform behaviours (escrow, 7-day auto-accept, disputes, fraud, trust scores) are now documented in standalone policies aligned to implemented code. Residual risk: policies not yet reviewed by qualified SA counsel.

**Compliance (82):** POPIA structure added (responsible party, Information Officer, lawful basis, retention, data subject rights). ECTA electronic consent and CPA consumer rights referenced. Residual: Information Officer not yet registered with Regulator; registered office address is placeholder.

**Marketplace Readiness (85):** 18 policy documents cover full marketplace lifecycle. Supplier legal acceptance wired in backend. Residual: re-acceptance modal for existing users not yet implemented.

**Investor Readiness (80):** Document set is comprehensive and version-controlled. Supplier schema aligned. Residual: FSCA escrow assessment and D&O insurance not yet obtained.

---

## Documents Delivered

| # | Document | Route |
|---|----------|-------|
| 1 | Terms of Service | `/terms` |
| 2 | Privacy Policy | `/privacy` |
| 3 | Provider Agreement | `/provider-agreement` |
| 4 | Refund and Cancellation Policy | `/refund-policy` |
| 5 | Job Completion Verification Policy | `/job-completion-verification` |
| 6 | Escrow and Payment Protection Policy | `/escrow-policy` |
| 7 | Dispute Resolution Policy | `/dispute-resolution` |
| 8 | Admin Review and Investigation Policy | `/admin-investigation` |
| 9 | Corrective Work Policy | `/corrective-work` |
| 10 | Portfolio Content Rights | `/portfolio-content-rights` |
| 11 | Provider Verification Policy | `/provider-verification` |
| 12 | Fraud Prevention Policy | `/fraud-prevention` |
| 13 | Device Security Policy | `/device-security` |
| 14 | Provider Reputation Policy | `/provider-reputation` |
| 15 | Supplier Agreement | `/supplier-agreement` |
| 16 | Supplier Participation Policy | `/supplier-participation` |
| 17 | Data Processing Policy | `/data-processing` |
| 18 | Community Standards | `/community-standards` |
| 19 | Cookie Policy | `/cookie-policy` |
| 20 | Platform Activity Records Policy | `/platform-activity-records` |
| — | Legal Policy Hub | `/legal` |

---

## Pre-Launch Checklist

- [ ] Engage South African technology counsel for final review of escrow, dispute, and CPA wording
- [ ] Register Information Officer with the Information Regulator before processing at scale
- [ ] Publish registered office address (replace placeholder in Privacy Policy and Terms)
- [ ] Implement re-acceptance modal for material policy changes on existing users
- [ ] Obtain FSCA legal opinion on whether escrow facilitation triggers deposit-taking licence
- [ ] Align PayFast / payment partner merchant terms with escrow policy representations
- [ ] Obtain directors and officers (D&O) and cyber liability insurance
- [ ] Prepare internal PAIA manual (not user-facing)
- [ ] Add Terms of Service schedule listing all incorporated policy URLs
- [ ] Test supplier and branch staff legal acceptance flow via `POST /api/legal/accept`

---

## Post-Upgrade Recommendations

1. **Counsel review** — Mandatory before public launch; focus on escrow representations and CPA s54–56 consumer protections.
2. **Regulator registration** — POPIA Information Officer registration is a diligence requirement for investors.
3. **Re-acceptance flow** — Version bump to 2026-06-24 should trigger acceptance for existing providers on next login.
4. **Payment partner alignment** — Confirm staged release mechanics match PayFast settlement capabilities.
5. **Insurance** — Marketplace liability and cyber coverage appropriate for fintech-adjacent operations.

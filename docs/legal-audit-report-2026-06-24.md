# EloFix Legal Audit Report

**Date:** 24 June 2026  
**Prepared for:** EloFix (Pty) Ltd  
**Scope:** Full legal framework audit prior to public launch upgrade

---

## Executive Summary

Prior to this upgrade, EloFix maintained four legal documents (Terms of Service, Privacy Policy, Provider Agreement, Refund and Cancellation Policy) that did not accurately reflect implemented platform behaviour. Critical gaps existed in escrow mechanics, job completion verification, dispute resolution, fraud prevention, device intelligence, trust scoring, and supplier marketplace operations. South African compliance frameworks (POPIA, ECTA, CPA) were referenced implicitly at best.

This report documents pre-upgrade findings. Remediation is implemented in the legal framework upgrade dated 2026-06-24.

---

## Gap Matrix: Platform Behaviour vs Legal Documentation

| Risk Area | Platform Reality | Pre-Upgrade Legal Gap | Severity |
|-----------|-----------------|----------------------|----------|
| Job completion | 7-day confirmation window; hourly cron auto-accept; manual accept requires rating + media | Not mentioned | **Critical** |
| Escrow | 7% commission; 50% provider share at labor payment; remainder on completion | Vague "milestone payouts" only | **Critical** |
| Disputes | Customer opens during AWAITING_CONFIRMATION; admin outcomes include full/partial refund, release funds, return provider | Two sentences in Refund Policy | **Critical** |
| Cancellation | Customer en-route forfeiture = R0 refund | Not documented | **High** |
| Fraud / device | FingerprintJS, duplicate ID/phone/bank checks, account suspension | Not disclosed | **High** |
| Trust score | 0–100 score with visibility impact | Not disclosed | **High** |
| Supplier marketplace | 7% materials commission; fulfillment workflow | No supplier legal docs | **High** |
| Audit logs | Full admin/escrow/dispute/fraud audit trail | Partial privacy mention only | **Medium** |
| Auto-accept reviews | No public star review created on auto-accept | Not disclosed to customers | **Medium** |

---

## Compliance Risks (South African Law)

| Law | Pre-Upgrade Gap |
|-----|-----------------|
| **POPIA** | No named responsible party; no Information Officer; no lawful processing grounds (s11); no retention schedules; device fingerprints not disclosed; no Information Regulator complaint path |
| **ECTA** | No electronic consent mechanics; no record retention for electronic transactions |
| **CPA (s54–56)** | No fair-value language; vague refund timelines; no supplier accountability for goods |
| **PAIA** | Not referenced |

---

## Investor and Platform Risks

- Liability cap stated in USD ($100) — inappropriate for ZAR-denominated SA marketplace
- No indemnification from providers/suppliers toward EloFix
- No governing law / jurisdiction clause (Republic of South Africa)
- No force majeure or assignment clauses
- Supplier legal acceptance migration existed without schema/content/validation alignment
- No re-acceptance flow for material policy changes on existing users

---

## Operational Risks

- Legal documents not linked from supplier portal
- Frontend versions hardcoded; not fetched from API at runtime
- Definitions omitted: Supplier, Escrow, Dispute, Trust Score, Admin, Branch User

---

## Remediation Status

All identified gaps are addressed in the 2026-06-24 legal framework upgrade comprising 18 policy documents, version bump, supplier legal acceptance wiring, and investor readiness scoring. See `docs/legal-investor-readiness-2026-06-24.md`.

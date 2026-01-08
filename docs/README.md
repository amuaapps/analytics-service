# Analytics Service Documentation

## 📖 Documentation Index

This directory contains all documentation for the Analytics Service. Start here to find what you need.

### 🎯 Start Here (New Engineers)

1. **[Implementation Notes](IMPLEMENTATION_NOTES.md)** ⭐ **READ THIS FIRST**
   - Documentation hierarchy (what's authoritative)
   - Hard vs configurable limits
   - Blue/green deployment strategies
   - Common gotchas and quick reference

2. **[Quick Start](QUICK_START.md)**
   - Get running in 5 minutes
   - Basic usage examples

3. **[Local Development](LOCAL_DEVELOPMENT.md)**
   - Run without cloud dependencies
   - Test locally

### 📋 Authoritative References

These are the **single source of truth** - when in doubt, these win:

1. **[API Specification](analytics-service-spec-v1.0.0.md)** 
   - Public API contract
   - Request/response formats
   - HTTP status codes
   - **External clients depend on this**

2. **[Coding Standards](agents.md)**
   - Architecture principles (MACH)
   - TypeScript standards
   - Security requirements
   - Testing standards
   - **All code must comply**

3. **TypeScript Source Code** (`src/domain/`)
   - `base-types.ts` - Core types
   - `ingest-types.ts` - Ingest API types
   - `stored-event-types.ts` - Storage format
   - `query-types.ts` - Query API types
   - **Code is the source of truth for types**

### 🔧 Implementation Guides

- **[Domain Contracts](domain-contracts.md)** - Human-readable domain model explanation
- **[Platform Adapters](platform-adapters.md)** - AWS/Azure implementation details
- **[Configuration](configuration.md)** - Environment variables and config loading
- **[Security at Boundary](security-at-boundary.md)** - Authentication and validation
- **[Logging and Correlation](logging-and-correlation.md)** - Structured logging

### ☁️ Cloud Deployment

- **[Azure Deployment Guide](AZURE_DEPLOYMENT_GUIDE.md)** - Complete Azure deployment guide
- **[Secret Management](SECRET_MANAGEMENT.md)** - AWS Secrets Manager & Azure Key Vault
- **[AWS Infrastructure](../infra/aws/README.md)** - Terraform setup
- **[Azure Infrastructure](../infra/azure/README.md)** - Bicep setup

### 📊 Specifications & Details

- **[Limits Specification](LIMITS_SPECIFICATION.md)** - Hard maximums vs runtime limits
- **[Error Responses](ERROR_RESPONSES.md)** - Standardized error handling
- **[Dependency Management](DEPENDENCY_MANAGEMENT.md)** - Package management

### 🔄 Recent Changes

- **[Azure Config Summary](AZURE_CONFIG_SUMMARY.md)** - Azure configuration fixes
- **[Limits Reconciliation Status](LIMITS_RECONCILIATION_STATUS.md)** - Limits alignment work

## 🗺️ Documentation Hierarchy

When documentation conflicts, follow this precedence:

1. **API Specification** (`analytics-service-spec-v1.0.0.md`) - External contract
2. **TypeScript Source Code** (`src/domain/*.ts`) - Type definitions
3. **Infrastructure Code** (`infra/aws/`, `infra/azure/`) - Deployed resources
4. **Coding Standards** (`agents.md`) - Development rules
5. **Supporting Documentation** (this directory) - Explanations and guides

**Rule:** If supporting docs conflict with authoritative sources, the authoritative source wins.

## 🚀 Common Tasks

### I want to...

**...understand the API**
→ Read `analytics-service-spec-v1.0.0.md`

**...deploy to AWS**
→ Read `../infra/aws/README.md`

**...deploy to Azure**
→ Read `AZURE_DEPLOYMENT_GUIDE.md`

**...run locally**
→ Read `LOCAL_DEVELOPMENT.md`

**...understand limits**
→ Read `IMPLEMENTATION_NOTES.md` (section: Limits)

**...configure secrets**
→ Read `SECRET_MANAGEMENT.md`

**...understand blue/green deployment**
→ Read `IMPLEMENTATION_NOTES.md` (section: Blue/Green Deployment)

**...understand the domain model**
→ Read `domain-contracts.md` or check `src/domain/*.ts`

**...follow coding standards**
→ Read `agents.md`

## 📝 Contributing to Docs

When updating documentation:

1. **Keep authoritative docs in sync** with code changes
2. **Update IMPLEMENTATION_NOTES.md** for architectural changes
3. **Don't duplicate** - link to authoritative sources instead
4. **Be specific** - include file paths, line numbers, examples
5. **Test examples** - ensure code snippets actually work

## ❓ Getting Help

1. Check `IMPLEMENTATION_NOTES.md` first
2. Search this directory for your topic
3. Check the relevant source code in `src/`
4. Review infrastructure code in `infra/`
5. Ask in team chat with specific questions

## 📚 External Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Azure Functions Best Practices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-best-practices)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Azure Bicep Documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)

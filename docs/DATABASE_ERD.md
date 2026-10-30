# Database relationships

Generated from the live PostgreSQL foreign keys. Exact nullability, composite keys, partial unique indexes and checks are listed in [the schema reference](DATABASE_SCHEMA.md). Logical service-level links are described there separately.

## Identity and organizations

```mermaid
erDiagram
  account {
    text id PK
    text userId FK
  }
  organization_members {
    text organization_id PK,FK
    text user_id PK,FK
    text role FK
  }
  organizations {
    text id PK
  }
  rateLimit {
    text id PK
  }
  roles {
    text id PK
  }
  session {
    text id PK
    text userId FK
  }
  user {
    text id PK
  }
  verification {
    text id PK
  }
  worker_profiles {
    text user_id PK,FK
    text organization_id FK
  }
  user ||--o{ account : "userId"
  organizations ||--o{ organization_members : "organization_id"
  roles |o--o{ organization_members : "role"
  user ||--o| organization_members : "user_id"
  user ||--o{ session : "userId"
  organizations ||--o{ worker_profiles : "organization_id"
  user ||--o| worker_profiles : "user_id"
```

## Inventory

```mermaid
erDiagram
  assignments {
    text id PK
    text organization_id FK
    text face_id FK
    text worker_id FK
    text assigned_by FK
    text parent_inspection_id FK
  }
  billboard_faces {
    text id PK
    text organization_id FK
    text structure_id FK
  }
  billboard_structures {
    text id PK
    text organization_id FK
  }
  location_coordinate_corrections {
    text id PK
    text organization_id FK
    text face_id FK
    text created_by FK
  }
  location_exceptions {
    text id PK
    text organization_id FK
    text assignment_id FK
    text authorized_by FK
  }
  organizations {
    text id PK
  }
  source_coordinates {
    text id PK
    text face_id FK
    text imported_by FK
  }
  user {
    text id PK
  }
  organizations ||--o{ billboard_faces : "organization_id"
  billboard_structures ||--o{ billboard_faces : "organization_id, structure_id"
  organizations ||--o{ billboard_structures : "organization_id"
  user ||--o{ location_coordinate_corrections : "created_by"
  billboard_faces ||--o{ location_coordinate_corrections : "organization_id, face_id"
  organizations ||--o{ location_coordinate_corrections : "organization_id"
  assignments ||--o{ location_exceptions : "assignment_id"
  user ||--o{ location_exceptions : "authorized_by"
  organizations ||--o{ location_exceptions : "organization_id"
  billboard_faces ||--o| source_coordinates : "face_id"
  user ||--o{ source_coordinates : "imported_by"
```

## Field visits and evidence

```mermaid
erDiagram
  assignments {
    text id PK
    text organization_id FK
    text face_id FK
    text worker_id FK
    text assigned_by FK
    text parent_inspection_id FK
  }
  billboard_faces {
    text id PK
    text organization_id FK
    text structure_id FK
  }
  challenges {
    text id PK
    text organization_id FK
    text assignment_id FK
    text worker_id FK
  }
  evidence_parts {
    text media_id PK,FK
    integer part PK
  }
  inspections {
    text id PK
    text organization_id FK
    text assignment_id FK
    text face_id FK
    text worker_id FK
    text challenge_id FK
  }
  media_evidence {
    text id PK
    text inspection_id FK
  }
  organization_members {
    text organization_id PK,FK
    text user_id PK,FK
    text role FK
  }
  organizations {
    text id PK
  }
  user {
    text id PK
  }
  user ||--o{ assignments : "assigned_by"
  billboard_faces ||--o{ assignments : "organization_id, face_id"
  organizations ||--o{ assignments : "organization_id"
  organization_members ||--o{ assignments : "organization_id, worker_id"
  inspections |o--o| assignments : "parent_inspection_id"
  assignments ||--o{ challenges : "assignment_id"
  organizations ||--o{ challenges : "organization_id"
  user ||--o{ challenges : "worker_id"
  media_evidence ||--o{ evidence_parts : "media_id"
  assignments ||--o| inspections : "assignment_id"
  challenges |o--o{ inspections : "challenge_id"
  billboard_faces ||--o{ inspections : "face_id"
  organizations ||--o{ inspections : "organization_id"
  user ||--o{ inspections : "worker_id"
  inspections ||--o{ media_evidence : "inspection_id"
```

## Review and reference baselines

```mermaid
erDiagram
  baseline_events {
    text id PK
    text baseline_id FK
    text organization_id FK
    text actor_id FK
  }
  billboard_faces {
    text id PK
    text organization_id FK
    text structure_id FK
  }
  inspections {
    text id PK
    text organization_id FK
    text assignment_id FK
    text face_id FK
    text worker_id FK
    text challenge_id FK
  }
  media_analysis {
    text media_id PK,FK
  }
  media_evidence {
    text id PK
    text inspection_id FK
  }
  organizations {
    text id PK
  }
  reference_baselines {
    text id PK
    text organization_id FK
    text face_id FK
    text inspection_id FK
    text actor_id FK
  }
  reference_photos {
    text baseline_id PK,FK
    text media_id FK
    text kind PK
  }
  review_cases {
    text inspection_id PK,FK
    text organization_id FK
  }
  review_decisions {
    text id PK
    text inspection_id FK
    text organization_id FK
    text actor_id FK
  }
  user {
    text id PK
  }
  verification_runs {
    text id PK
    text organization_id FK
    text inspection_id FK
  }
  user ||--o{ baseline_events : "actor_id"
  reference_baselines ||--o| baseline_events : "baseline_id"
  organizations ||--o{ baseline_events : "organization_id"
  media_evidence ||--o| media_analysis : "media_id"
  user ||--o{ reference_baselines : "actor_id"
  billboard_faces ||--o{ reference_baselines : "face_id"
  inspections ||--o{ reference_baselines : "inspection_id"
  organizations ||--o{ reference_baselines : "organization_id"
  reference_baselines ||--o{ reference_photos : "baseline_id"
  media_evidence ||--o{ reference_photos : "media_id"
  inspections ||--o| review_cases : "inspection_id"
  organizations ||--o{ review_cases : "organization_id"
  user ||--o{ review_decisions : "actor_id"
  inspections ||--o{ review_decisions : "inspection_id"
  organizations ||--o{ review_decisions : "organization_id"
  inspections ||--o{ verification_runs : "inspection_id"
  organizations ||--o{ verification_runs : "organization_id"
```

## Audit and operations

```mermaid
erDiagram
  activity_logs {
    text id PK
    text organization_id FK
    text actor_id FK
  }
  analysis_admissions {
    text id PK
    text organization_id FK
    text actor_id FK
  }
  audit_events {
    text id PK
    text organization_id FK
    text actor_id FK
  }
  organizations {
    text id PK
  }
  schema_migrations {
    text name PK
  }
  user {
    text id PK
  }
  user ||--o{ activity_logs : "actor_id"
  organizations ||--o{ activity_logs : "organization_id"
  user ||--o{ analysis_admissions : "actor_id"
  organizations ||--o{ analysis_admissions : "organization_id"
  user ||--o{ audit_events : "actor_id"
  organizations ||--o{ audit_events : "organization_id"
```

-- ROBOVERSE PostgreSQL schema (Phase 9 backend). Status: design-ready, not yet deployed.
-- The browser build stores the same ProjectFile JSON in localStorage; these tables accept it unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  role          text NOT NULL CHECK (role IN ('student','faculty','researcher','admin')),
  institution   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE materials (
  id         text PRIMARY KEY,                 -- e.g. 'al-6082-t6'
  name       text NOT NULL,
  density    double precision NOT NULL,        -- kg/m^3
  youngs_mod double precision,                 -- Pa
  notes      text
);

CREATE TABLE components (
  id           text PRIMARY KEY,               -- catalog id, e.g. 'motor-g400'
  name         text NOT NULL,
  category     text NOT NULL,
  subcategory  text,
  description  text,
  material_id  text REFERENCES materials(id),
  mass         double precision NOT NULL,      -- kg
  role         text,
  is_root      boolean NOT NULL DEFAULT false,
  spec         jsonb NOT NULL DEFAULT '{}',    -- motor / gearbox / elec / gripper / ft parameter blocks
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE component_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id  text NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  source        text NOT NULL,                 -- 'procedural', 'upload', 'grabcad', 'traceparts', ...
  source_url    text,
  licence       text NOT NULL,
  author        text,
  file_format   text NOT NULL,                 -- glb, gltf, step, stl, ...
  units         text NOT NULL DEFAULT 'm',
  dimensions    double precision[3],
  mass_props    jsonb,                         -- {m, c:[...], I:[...9]}
  storage_key   text,                          -- object-store key of the converted GLB
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE component_ports (
  component_id text NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  port_id      text NOT NULL,
  name         text NOT NULL,
  iface        text NOT NULL,                  -- interface code, e.g. 'AM-L', 'SH-14', 'FL-M', 'TF-40'
  direction    text NOT NULL CHECK (direction IN ('in','out')),
  pos          double precision[3] NOT NULL,
  rot_deg      double precision[3] NOT NULL DEFAULT '{0,0,0}',
  rotary       boolean NOT NULL DEFAULT false,
  hint         text,
  PRIMARY KEY (component_id, port_id)
);
CREATE INDEX ON component_ports (iface);

CREATE TABLE robot_templates (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  family      text NOT NULL,                   -- industrial-arm, cobot, scara, delta, humanoid, quadruped, ...
  description text,
  assembly    jsonb NOT NULL,                  -- Assembly JSON
  steps       jsonb,                           -- guided assembly steps
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  mode        text NOT NULL DEFAULT 'free',
  challenge   text,
  template_id text REFERENCES robot_templates(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutable snapshots of the complete ProjectFile -> version history / "return to a previous assembly"
CREATE TABLE project_versions (
  id          bigserial PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  file        jsonb NOT NULL,                  -- format 'roboverse-project'
  message     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

-- Normalised view of the assembly for queries/analytics (derived from project_versions.file)
CREATE TABLE assembly_instances (
  project_version_id bigint NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  uid          text NOT NULL,
  component_id text NOT NULL REFERENCES components(id),
  parent_uid   text,
  parent_port  text,
  clock        smallint NOT NULL DEFAULT 0,
  params       jsonb,
  PRIMARY KEY (project_version_id, uid)
);

CREATE TABLE simulation_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_version_id bigint NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  engine             text NOT NULL DEFAULT 'roboverse-rnea',  -- 'mujoco', 'gazebo', ...
  settings           jsonb NOT NULL,          -- dt, recordHz, payload, scenario, control
  status             text NOT NULL CHECK (status IN ('queued','running','done','failed')),
  error              text,
  metrics            jsonb,
  events             jsonb,
  sim_time_s         double precision,
  wall_time_s        double precision,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE simulation_signals (
  run_id  uuid NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  key     text NOT NULL,                       -- e.g. 'J2.tau'
  label   text NOT NULL,
  unit    text NOT NULL,
  grp     text NOT NULL,
  t0      double precision NOT NULL DEFAULT 0,
  dt      double precision NOT NULL,           -- recording period
  samples real[] NOT NULL,
  PRIMARY KEY (run_id, key)
);

CREATE TABLE exercises (
  id          text PRIMARY KEY,                -- 'E1', 'arm6-payload', ...
  kind        text NOT NULL CHECK (kind IN ('experiment','challenge')),
  path        text,
  title       text NOT NULL,
  content     jsonb NOT NULL,                  -- aim, theory, procedure, viva, criteria ...
  version     integer NOT NULL DEFAULT 1
);

CREATE TABLE experiments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id text REFERENCES exercises(id),
  run_id      uuid REFERENCES simulation_runs(id),
  score       double precision,
  assessment  jsonb,                           -- per-criterion pass/fail + details
  submitted_at timestamptz
);

CREATE TABLE exported_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  format      text NOT NULL CHECK (format IN ('pdf','html','csv','json','urdf','png','svg','sdf','xacro','glb')),
  storage_key text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

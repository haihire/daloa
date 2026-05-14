-- admin_users.role ENUM 불일치 수정
-- 기존: ENUM('owner','demo')  →  변경: ENUM('master','guest')
-- 실행: db-migrate.yml 워크플로우로 실행

-- Step 1: ENUM → VARCHAR (자유롭게 UPDATE 가능하도록)
ALTER TABLE admin_users
  MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'guest';

-- Step 2: 구 값 → 신 값 매핑
UPDATE admin_users SET role = 'master' WHERE role = 'owner';
UPDATE admin_users SET role = 'guest'  WHERE role = 'demo';

-- Step 3: 올바른 ENUM으로 변경
ALTER TABLE admin_users
  MODIFY COLUMN role ENUM('master','guest') NOT NULL DEFAULT 'guest';

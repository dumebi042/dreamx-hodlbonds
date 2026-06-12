CREATE ROLE intake LOGIN PASSWORD 'intake_pw';
CREATE ROLE executor LOGIN PASSWORD 'executor_pw';
CREATE ROLE reports LOGIN PASSWORD 'reports_pw';

CREATE DATABASE myapp_test;

-- Grant privileges on dev
GRANT CONNECT ON DATABASE myapp_dev TO intake_app;
GRANT CONNECT ON DATABASE myapp_dev TO executor_app;
GRANT USAGE ON SCHEMA public TO intake;
GRANT USAGE ON SCHEMA public TO executor;
GRANT USAGE ON SCHEMA public TO reports;

-- Grant privileges on test
GRANT CONNECT ON DATABASE myapp_test TO intake_app;
GRANT CONNECT ON DATABASE myapp_test TO executor_app;

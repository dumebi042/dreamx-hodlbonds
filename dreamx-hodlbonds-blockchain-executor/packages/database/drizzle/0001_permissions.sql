-- Permissions --
GRANT SELECT, INSERT on table queue to intake;
GRANT USAGE, SELECT on sequence queue_id_seq to intake;
GRANT SELECT, UPDATE on table queue to executor;
GRANT SELECT on table contracts to executor;
GRANT SELECT on table contracts to reports;
GRANT SELECT on table queue to reports;
GRANT SELECT on table queue_log to reports;

-- trigger for logging changes to queue_log table --
CREATE OR REPLACE FUNCTION log_queue_changes()
    RETURNS TRIGGER AS
$$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO queue_log (event_type, event_time, queue_id, old_row, new_row)
        VALUES ('UPDATED', current_timestamp, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO queue_log (event_type, event_time, queue_id, new_row)
        VALUES ('INSERTED', current_timestamp, NEW.id, to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO queue_log (event_type, event_time, queue_id, old_row)
        VALUES ('DELETED', current_timestamp, OLD.id, to_jsonb(OLD));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER queue_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON queue
    FOR EACH ROW
EXECUTE FUNCTION log_queue_changes();

-- trigger for auto-updating last_updated timestamp on contracts table --
CREATE OR REPLACE FUNCTION last_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated := NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_update_timestamp
    BEFORE INSERT OR UPDATE ON contracts
    FOR EACH ROW EXECUTE FUNCTION last_update_timestamp();

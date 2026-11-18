SET search_path=club,public;
CREATE FUNCTION check_booking_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF (OLD.status='HOLD' AND NEW.status IN ('CONFIRMED','EXPIRED','CANCELLED'))
 OR (OLD.status='CONFIRMED' AND NEW.status IN ('IN_USE','NO_SHOW','CANCELLED'))
 OR (OLD.status='IN_USE' AND NEW.status='COMPLETED') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Недопустимый переход брони из % в %',OLD.status,NEW.status;
END $$;
CREATE TRIGGER booking_transition BEFORE UPDATE OF status ON booking FOR EACH ROW EXECUTE FUNCTION check_booking_transition();

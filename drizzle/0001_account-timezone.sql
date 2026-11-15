-- Account Timezones must be named zones recognized by PostgreSQL.
create function validate_account_timezone() returns trigger language plpgsql as $$
begin
  if (new.timezone <> 'UTC' and position('/' in new.timezone) = 0)
     or not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid Account Timezone';
  end if;
  return new;
end;
$$;
create trigger user_timezone_check before insert or update of timezone on "user"
for each row execute function validate_account_timezone();

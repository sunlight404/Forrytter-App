-- Public holidays and the stall's December 24–31 days off. Ordinary Sundays stay excluded.
create or replace function public.is_feeding_holiday(p_date date)
returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
 y integer := extract(year from p_date)::integer;
 a integer; b integer; c integer; d integer; e integer; f integer;
 g integer; h integer; i integer; k integer; l integer; m integer;
 easter date;
begin
 if y<1583 or y>9999 then return false;end if;
 if extract(month from p_date)=12 and extract(day from p_date) between 24 and 31 then return true;end if;
 if p_date=any(array[pg_catalog.make_date(y,1,1),pg_catalog.make_date(y,5,1),pg_catalog.make_date(y,5,17),pg_catalog.make_date(y,12,25),pg_catalog.make_date(y,12,26)]) then return true;end if;
 a:=y%19;b:=y/100;c:=y%100;d:=b/4;e:=b%4;f:=(b+8)/25;
 g:=(b-f+1)/3;h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;
 l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;
 easter:=pg_catalog.make_date(y,(h+l-7*m+114)/31,(h+l-7*m+114)%31+1);
 return (p_date-easter)=any(array[-3,-2,0,1,39,49,50]);
end;
$$;
revoke all on function public.is_feeding_holiday(date) from public,anon;
grant execute on function public.is_feeding_holiday(date) to authenticated,service_role;

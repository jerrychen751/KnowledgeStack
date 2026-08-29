-- Vantera Semiconductor order-management extract, loaded into tenant_company.
-- No COMMENT ON statements anywhere in this folder: describeTables reads pg_description,
-- so the test schema omits database documentation on purpose.

CREATE TABLE part_mstr (
    part_no    varchar(24) PRIMARY KEY,
    part_desc  varchar(120) NOT NULL,
    fam_cd     char(2) NOT NULL,
    pkg_cd     varchar(8) NOT NULL,
    moq        integer NOT NULL,
    lt_wks     smallint NOT NULL,
    rohs_flg   char(1) NOT NULL DEFAULT 'Y',
    eol_flg    char(1) NOT NULL DEFAULT 'N',
    crt_dt     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE cust_mstr (
    cust_id     integer PRIMARY KEY,
    cust_nm     varchar(80) NOT NULL,
    cst_typ_cd  char(2) NOT NULL,
    stat_cd     char(1) NOT NULL,
    del_flg     char(1) NOT NULL DEFAULT 'N',
    rgn_cd      char(4) NOT NULL,
    crt_dt      timestamp NOT NULL,
    lst_mod_dt  timestamp NOT NULL
);

CREATE TABLE ord_hdr (
    ord_id       integer PRIMARY KEY,
    cust_id      integer NOT NULL,
    ord_dt       date NOT NULL,
    ord_stat_cd  char(2) NOT NULL,
    tot_amt      bigint NOT NULL DEFAULT 0,
    curr_cd      char(3) NOT NULL DEFAULT 'USD',
    po_ref       varchar(32),
    lst_mod_dt   timestamp NOT NULL
);

CREATE TABLE ord_ln (
    ord_id   integer NOT NULL,
    ln_no    smallint NOT NULL,
    part_no  varchar(24) NOT NULL,
    qty      integer NOT NULL,
    unit_px  bigint NOT NULL,
    shp_dt   date,
    PRIMARY KEY (ord_id, ln_no)
);

-- Join columns are indexed but carry no REFERENCES clause, so information_schema
-- exposes no path from ord_hdr to cust_mstr or from ord_ln to part_mstr.
CREATE INDEX ix_ord_hdr_cust ON ord_hdr (cust_id);
CREATE INDEX ix_ord_hdr_dt ON ord_hdr (ord_dt);
CREATE INDEX ix_ord_ln_part ON ord_ln (part_no);

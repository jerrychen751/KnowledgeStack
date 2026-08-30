-- Vantera Semiconductor order-management extract, loaded into tenant_company.
-- No COMMENT ON statements anywhere in this folder: describeTables reads pg_description,
-- so the test schema omits database documentation on purpose.

CREATE TABLE code_lkp (
    cd_typ    varchar(12) NOT NULL,
    cd_val    varchar(8) NOT NULL,
    cd_desc   varchar(80) NOT NULL,
    sort_seq  smallint NOT NULL,
    actv_flg  char(1) NOT NULL DEFAULT 'Y',
    lst_mod_dt timestamp NOT NULL,
    PRIMARY KEY (cd_typ, cd_val)
);

CREATE TABLE pay_terms (
    terms_cd   char(4) PRIMARY KEY,
    terms_desc varchar(60) NOT NULL,
    net_days   smallint NOT NULL,
    disc_days  smallint NOT NULL,
    disc_bp    smallint NOT NULL,
    actv_flg   char(1) NOT NULL DEFAULT 'Y'
);

CREATE TABLE whs_mstr (
    whs_cd   char(4) PRIMARY KEY,
    whs_nm   varchar(60) NOT NULL,
    rgn_cd   char(4) NOT NULL,
    ctry_cd  char(2) NOT NULL,
    whs_typ_cd char(2) NOT NULL,
    actv_flg char(1) NOT NULL DEFAULT 'Y'
);

CREATE TABLE pkg_mstr (
    pkg_cd   varchar(8) PRIMARY KEY,
    pkg_desc varchar(60) NOT NULL,
    pin_cnt  smallint NOT NULL,
    reel_qty integer NOT NULL,
    mnt_typ_cd char(3) NOT NULL
);

CREATE TABLE emp_mstr (
    emp_id     integer PRIMARY KEY,
    emp_nm     varchar(60) NOT NULL,
    job_cd     char(4) NOT NULL,
    mgr_emp_id integer,
    hire_dt    date NOT NULL,
    term_dt    date,
    email_txt  varchar(80) NOT NULL
);

CREATE TABLE sls_terr (
    terr_cd    char(6) PRIMARY KEY,
    terr_nm    varchar(60) NOT NULL,
    rgn_cd     char(4) NOT NULL,
    mgr_emp_id integer NOT NULL,
    actv_flg   char(1) NOT NULL DEFAULT 'Y'
);

CREATE TABLE part_mstr (
    part_no      varchar(24) PRIMARY KEY,
    part_desc    varchar(120) NOT NULL,
    fam_cd       char(2) NOT NULL,
    pkg_cd       varchar(8) NOT NULL,
    moq          integer NOT NULL,
    lt_wks       smallint NOT NULL,
    rohs_flg     char(1) NOT NULL DEFAULT 'Y',
    eol_flg      char(1) NOT NULL DEFAULT 'N',
    std_cost     bigint NOT NULL,
    qual_cd      char(3) NOT NULL DEFAULT 'STD',
    fab_site_cd  char(4) NOT NULL,
    succ_part_no varchar(24),
    crt_dt       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE cust_mstr (
    cust_id      integer PRIMARY KEY,
    cust_nm      varchar(80) NOT NULL,
    cst_typ_cd   char(2) NOT NULL,
    stat_cd      char(1) NOT NULL,
    del_flg      char(1) NOT NULL DEFAULT 'N',
    rgn_cd       char(4) NOT NULL,
    corp_cust_id integer,
    terms_cd     char(4) NOT NULL,
    cr_lmt_amt   bigint NOT NULL DEFAULT 0,
    crt_dt       timestamp NOT NULL,
    lst_mod_dt   timestamp NOT NULL
);

CREATE TABLE cust_addr (
    cust_id     integer NOT NULL,
    addr_seq    smallint NOT NULL,
    addr_typ_cd char(2) NOT NULL,
    addr_ln1    varchar(80) NOT NULL,
    city_nm     varchar(40) NOT NULL,
    st_cd       varchar(4),
    post_cd     varchar(12) NOT NULL,
    ctry_cd     char(2) NOT NULL,
    dflt_flg    char(1) NOT NULL DEFAULT 'N',
    actv_flg    char(1) NOT NULL DEFAULT 'Y',
    PRIMARY KEY (cust_id, addr_seq)
);

CREATE TABLE cust_ctct (
    cust_id   integer NOT NULL,
    ctct_seq  smallint NOT NULL,
    ctct_nm   varchar(60) NOT NULL,
    role_cd   char(4) NOT NULL,
    email_txt varchar(80) NOT NULL,
    phon_txt  varchar(24),
    actv_flg  char(1) NOT NULL DEFAULT 'Y',
    PRIMARY KEY (cust_id, ctct_seq)
);

CREATE TABLE cust_terr_asgn (
    cust_id    integer NOT NULL,
    eff_dt     date NOT NULL,
    exp_dt     date NOT NULL,
    terr_cd    char(6) NOT NULL,
    rep_emp_id integer NOT NULL,
    PRIMARY KEY (cust_id, eff_dt)
);

CREATE TABLE part_xref (
    cust_id      integer NOT NULL,
    cust_part_no varchar(32) NOT NULL,
    part_no      varchar(24) NOT NULL,
    eff_dt       date NOT NULL,
    actv_flg     char(1) NOT NULL DEFAULT 'Y',
    PRIMARY KEY (cust_id, cust_part_no)
);

CREATE TABLE price_lst (
    cust_id     integer NOT NULL,
    part_no     varchar(24) NOT NULL,
    eff_dt      date NOT NULL,
    exp_dt      date NOT NULL,
    lst_px      bigint NOT NULL,
    min_qty     integer NOT NULL,
    appr_emp_id integer NOT NULL,
    PRIMARY KEY (cust_id, part_no, eff_dt)
);

CREATE TABLE ord_hdr (
    ord_id       integer PRIMARY KEY,
    cust_id      integer NOT NULL,
    ord_dt       date NOT NULL,
    ord_stat_cd  char(2) NOT NULL,
    ord_typ_cd   char(2) NOT NULL DEFAULT 'ST',
    tot_amt      bigint NOT NULL DEFAULT 0,
    curr_cd      char(3) NOT NULL DEFAULT 'USD',
    po_ref       varchar(32),
    shp_to_seq   smallint NOT NULL,
    bil_to_seq   smallint NOT NULL,
    rep_emp_id   integer NOT NULL,
    terms_cd     char(4) NOT NULL,
    req_dt       date,
    lst_mod_dt   timestamp NOT NULL
);

CREATE TABLE ord_ln (
    ord_id     integer NOT NULL,
    ln_no      smallint NOT NULL,
    part_no    varchar(24) NOT NULL,
    qty        integer NOT NULL,
    unit_px    bigint NOT NULL,
    lst_px     bigint NOT NULL DEFAULT 0,
    ln_stat_cd char(2) NOT NULL DEFAULT 'OP',
    canc_qty   integer NOT NULL DEFAULT 0,
    sched_dt   date,
    shp_dt     date,
    PRIMARY KEY (ord_id, ln_no)
);

CREATE TABLE ord_cmt (
    ord_id     integer NOT NULL,
    cmt_seq    smallint NOT NULL,
    cmt_typ_cd char(2) NOT NULL,
    cmt_txt    varchar(72) NOT NULL,
    ent_emp_id integer NOT NULL,
    ent_dt     timestamp NOT NULL,
    PRIMARY KEY (ord_id, cmt_seq)
);

CREATE TABLE shpmt_hdr (
    shpmt_id integer PRIMARY KEY,
    ord_id   integer NOT NULL,
    whs_cd   char(4) NOT NULL,
    shp_dt   date NOT NULL,
    carr_cd  char(4) NOT NULL,
    trk_no   varchar(32),
    frt_amt  bigint NOT NULL DEFAULT 0,
    inco_cd  char(3) NOT NULL
);

CREATE TABLE shpmt_ln (
    shpmt_id  integer NOT NULL,
    shp_ln_no smallint NOT NULL,
    ord_id    integer NOT NULL,
    ln_no     smallint NOT NULL,
    part_no   varchar(24) NOT NULL,
    shp_qty   integer NOT NULL,
    lot_id    varchar(16) NOT NULL,
    PRIMARY KEY (shpmt_id, shp_ln_no)
);

CREATE TABLE invc_hdr (
    invc_id     integer PRIMARY KEY,
    invc_no     varchar(16) NOT NULL,
    cust_id     integer NOT NULL,
    ord_id      integer NOT NULL,
    invc_typ_cd char(2) NOT NULL,
    invc_dt     date NOT NULL,
    due_dt      date NOT NULL,
    invc_amt    bigint NOT NULL,
    tax_amt     bigint NOT NULL DEFAULT 0,
    paid_amt    bigint NOT NULL DEFAULT 0,
    pay_dt      date,
    curr_cd     char(3) NOT NULL DEFAULT 'USD'
);

CREATE TABLE invc_ln (
    invc_id   integer NOT NULL,
    inv_ln_no smallint NOT NULL,
    ord_id    integer NOT NULL,
    ln_no     smallint NOT NULL,
    part_no   varchar(24) NOT NULL,
    bil_qty   integer NOT NULL,
    unit_px   bigint NOT NULL,
    ext_amt   bigint NOT NULL,
    PRIMARY KEY (invc_id, inv_ln_no)
);

CREATE TABLE lot_mstr (
    lot_id      varchar(16) PRIMARY KEY,
    part_no     varchar(24) NOT NULL,
    fab_site_cd char(4) NOT NULL,
    asy_site_cd char(4) NOT NULL,
    strt_dt     date NOT NULL,
    cmpl_dt     date,
    strt_qty    integer NOT NULL,
    good_qty    integer NOT NULL,
    yld_bp      integer NOT NULL,
    lot_stat_cd char(2) NOT NULL
);

CREATE TABLE inv_bal (
    snap_dt    date NOT NULL,
    part_no    varchar(24) NOT NULL,
    whs_cd     char(4) NOT NULL,
    on_hnd_qty integer NOT NULL,
    alloc_qty  integer NOT NULL,
    on_ord_qty integer NOT NULL,
    PRIMARY KEY (snap_dt, part_no, whs_cd)
);

CREATE TABLE rma_hdr (
    rma_id      integer PRIMARY KEY,
    cust_id     integer NOT NULL,
    ord_id      integer,
    part_no     varchar(24) NOT NULL,
    rtn_qty     integer NOT NULL,
    rsn_cd      char(3) NOT NULL,
    rma_stat_cd char(2) NOT NULL,
    open_dt     date NOT NULL,
    clse_dt     date,
    cr_invc_id  integer
);

CREATE TABLE ord_hdr_hist (
    ord_no      integer PRIMARY KEY,
    cust_no     integer NOT NULL,
    ord_dt      date NOT NULL,
    stat        char(1) NOT NULL,
    tot_amt_usd integer NOT NULL,
    sls_rep_ini char(3),
    load_dt     timestamp NOT NULL
);

-- Join columns are indexed but carry no REFERENCES clause, so information_schema
-- exposes no path from ord_hdr to cust_mstr or from ord_ln to part_mstr.
CREATE INDEX ix_ord_hdr_cust ON ord_hdr (cust_id);
CREATE INDEX ix_ord_hdr_dt ON ord_hdr (ord_dt);
CREATE INDEX ix_ord_hdr_rep ON ord_hdr (rep_emp_id);
CREATE INDEX ix_ord_ln_part ON ord_ln (part_no);
CREATE INDEX ix_cust_mstr_corp ON cust_mstr (corp_cust_id);
CREATE INDEX ix_cust_terr_asgn_terr ON cust_terr_asgn (terr_cd);
CREATE INDEX ix_part_xref_part ON part_xref (part_no);
CREATE INDEX ix_price_lst_part ON price_lst (part_no);
CREATE INDEX ix_shpmt_hdr_ord ON shpmt_hdr (ord_id);
CREATE INDEX ix_shpmt_hdr_dt ON shpmt_hdr (shp_dt);
CREATE INDEX ix_shpmt_ln_ord ON shpmt_ln (ord_id, ln_no);
CREATE INDEX ix_shpmt_ln_lot ON shpmt_ln (lot_id);
CREATE INDEX ix_invc_hdr_cust ON invc_hdr (cust_id);
CREATE INDEX ix_invc_hdr_ord ON invc_hdr (ord_id);
CREATE INDEX ix_invc_hdr_dt ON invc_hdr (invc_dt);
CREATE INDEX ix_invc_ln_ord ON invc_ln (ord_id, ln_no);
CREATE INDEX ix_lot_mstr_part ON lot_mstr (part_no);
CREATE INDEX ix_inv_bal_part ON inv_bal (part_no);
CREATE INDEX ix_rma_hdr_cust ON rma_hdr (cust_id);
CREATE INDEX ix_ord_hdr_hist_cust ON ord_hdr_hist (cust_no);
CREATE INDEX ix_ord_hdr_hist_dt ON ord_hdr_hist (ord_dt);

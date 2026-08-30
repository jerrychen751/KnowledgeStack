INSERT INTO price_lst (cust_id, part_no, eff_dt, exp_dt, lst_px, min_qty, appr_emp_id)
SELECT
    h.cust_id,
    l.part_no,
    CASE WHEN extract(year FROM h.ord_dt) = 2025 THEN DATE '2024-10-01' ELSE DATE '2026-01-01' END,
    CASE WHEN extract(year FROM h.ord_dt) = 2025 THEN DATE '2025-12-31' ELSE DATE '9999-12-31' END,
    (ceil(max(l.unit_px) * 1.08 / 10) * 10)::bigint,
    max(p.moq),
    max(a.rep_emp_id)
FROM ord_ln l
JOIN ord_hdr h ON h.ord_id = l.ord_id
JOIN part_mstr p ON p.part_no = l.part_no
JOIN cust_terr_asgn a ON a.cust_id = h.cust_id AND h.ord_dt BETWEEN a.eff_dt AND a.exp_dt
WHERE h.ord_typ_cd = 'ST'
GROUP BY h.cust_id, l.part_no, extract(year FROM h.ord_dt);

UPDATE ord_ln l
SET lst_px = COALESCE(
    (SELECT p.lst_px
     FROM price_lst p
     JOIN ord_hdr h ON h.ord_id = l.ord_id
     WHERE p.cust_id = h.cust_id AND p.part_no = l.part_no AND h.ord_dt BETWEEN p.eff_dt AND p.exp_dt),
    (SELECT max(p2.lst_px) FROM price_lst p2 WHERE p2.part_no = l.part_no),
    (SELECT (pm.std_cost * 25) / 10 FROM part_mstr pm WHERE pm.part_no = l.part_no));

-- Ship dates exist only where the order left the dock. OP, BO and CN lines keep shp_dt NULL.
UPDATE ord_ln l
SET shp_dt = h.ord_dt + (14 + l.ln_no * 3)
FROM ord_hdr h
WHERE h.ord_id = l.ord_id AND h.ord_stat_cd IN ('IV', 'SH');

UPDATE ord_ln l
SET ln_stat_cd = CASE
        WHEN l.ord_id IN (5031, 5048, 5052, 5079) AND l.ln_no = 1 THEN 'PS'
        WHEN h.ord_stat_cd IN ('IV', 'SH') THEN 'SH'
        ELSE h.ord_stat_cd
    END,
    sched_dt = CASE
        WHEN h.ord_stat_cd IN ('IV', 'SH') THEN h.ord_dt + (14 + l.ln_no * 3)
        WHEN h.ord_stat_cd = 'CN' THEN NULL
        ELSE h.ord_dt + (p.lt_wks * 7)
    END,
    canc_qty = CASE
        WHEN h.ord_stat_cd = 'CN' THEN l.qty
        WHEN l.ord_id IN (5058, 5060) AND l.ln_no = 1 THEN l.qty / 4
        ELSE 0
    END
FROM ord_hdr h, part_mstr p
WHERE h.ord_id = l.ord_id AND p.part_no = l.part_no;

-- tot_amt is derived, never keyed. qty * unit_px is in hundredths of a cent; / 100 lands in cents.
UPDATE ord_hdr h
SET tot_amt = COALESCE((SELECT SUM(l.qty * l.unit_px) / 100 FROM ord_ln l WHERE l.ord_id = h.ord_id), 0);

WITH lot_base AS (
    SELECT
        p.part_no,
        p.fab_site_cd,
        p.moq,
        (row_number() OVER (ORDER BY p.part_no, s.n))::int AS rn
    FROM part_mstr p
    CROSS JOIN generate_series(1, 4) AS s(n)
), lot_calc AS (
    SELECT
        b.part_no,
        b.fab_site_cd,
        b.rn,
        DATE '2024-01-15' + ((b.rn * 149) % 790) AS strt_dt,
        b.moq * (6 + (b.rn * 3) % 9) AS strt_qty,
        8400 + ((b.rn * 7919) % 1400) AS yld_bp,
        CASE
            WHEN b.rn % 53 = 0 THEN 'SC'
            WHEN b.rn % 29 = 0 THEN 'HD'
            WHEN b.rn % 19 = 0 THEN 'WP'
            ELSE 'CP'
        END AS stat
    FROM lot_base b
)
INSERT INTO lot_mstr (lot_id, part_no, fab_site_cd, asy_site_cd, strt_dt, cmpl_dt, strt_qty, good_qty, yld_bp, lot_stat_cd)
SELECT
    'L' || to_char(c.strt_dt, 'YYMM') || lpad(c.rn::text, 4, '0'),
    c.part_no,
    c.fab_site_cd,
    (ARRAY['PH04','MY05','CN06'])[1 + (c.rn % 3)],
    c.strt_dt,
    CASE WHEN c.stat = 'WP' THEN NULL ELSE c.strt_dt + 70 + (c.rn % 31) END,
    c.strt_qty,
    CASE WHEN c.stat = 'SC' THEN 0 ELSE c.strt_qty * c.yld_bp / 10000 END,
    CASE WHEN c.stat = 'SC' THEN 0 ELSE (c.strt_qty * c.yld_bp / 10000) * 10000 / c.strt_qty END,
    c.stat
FROM lot_calc c;

INSERT INTO shpmt_hdr (shpmt_id, ord_id, whs_cd, shp_dt, carr_cd, trk_no, frt_amt, inco_cd)
SELECT
    8000 + (h.ord_id - 5000),
    h.ord_id,
    CASE c.rgn_cd
        WHEN 'AMER' THEN CASE WHEN h.ord_id % 2 = 0 THEN 'DAL1' ELSE 'SJC2' END
        WHEN 'EMEA' THEN 'EIN1'
        WHEN 'JAPN' THEN 'OSA1'
        ELSE CASE WHEN h.ord_id % 3 = 0 THEN 'PEN1' ELSE 'SIN1' END
    END,
    h.ord_dt + 17,
    (ARRAY['FDXP','FDXE','UPSW','DHLE','LTLF'])[1 + (h.ord_id % 5)],
    CASE WHEN h.ord_id % 5 = 4 THEN NULL ELSE '1Z' || lpad(((h.ord_id * 8171) % 1000000)::text, 9, '0') END,
    8500 + ((h.ord_id * 4409) % 84000),
    CASE c.rgn_cd WHEN 'AMER' THEN 'DAP' WHEN 'APAC' THEN 'EXW' ELSE 'FCA' END
FROM ord_hdr h
JOIN cust_mstr c ON c.cust_id = h.cust_id
WHERE h.ord_stat_cd IN ('IV', 'SH') AND h.ord_typ_cd <> 'RM';

INSERT INTO shpmt_hdr (shpmt_id, ord_id, whs_cd, shp_dt, carr_cd, trk_no, frt_amt, inco_cd)
SELECT
    8500 + (h.ord_id - 5000),
    h.ord_id,
    CASE c.rgn_cd
        WHEN 'AMER' THEN 'DAL1'
        WHEN 'EMEA' THEN 'EIN1'
        WHEN 'JAPN' THEN 'OSA1'
        ELSE 'SIN1'
    END,
    h.ord_dt + 24,
    (ARRAY['FDXP','FDXE','UPSW','DHLE','LTLF'])[1 + ((h.ord_id + 2) % 5)],
    '1Z' || lpad(((h.ord_id * 5171) % 1000000)::text, 9, '0'),
    8500 + ((h.ord_id * 3301) % 62000),
    CASE c.rgn_cd WHEN 'AMER' THEN 'DAP' WHEN 'APAC' THEN 'EXW' ELSE 'FCA' END
FROM ord_hdr h
JOIN cust_mstr c ON c.cust_id = h.cust_id
WHERE h.ord_id IN (5022, 5031, 5079, 5080);

INSERT INTO shpmt_ln (shpmt_id, shp_ln_no, ord_id, ln_no, part_no, shp_qty, lot_id)
SELECT
    s.shpmt_id,
    row_number() OVER (PARTITION BY s.shpmt_id ORDER BY l.ln_no)::smallint,
    l.ord_id,
    l.ln_no,
    l.part_no,
    CASE WHEN l.ln_stat_cd = 'PS' THEN (l.qty * 6) / 10 ELSE l.qty END,
    COALESCE(
        (SELECT m.lot_id
         FROM lot_mstr m
         WHERE m.part_no = l.part_no AND m.lot_stat_cd = 'CP' AND m.cmpl_dt <= s.shp_dt
         ORDER BY m.cmpl_dt DESC, m.lot_id
         LIMIT 1),
        (SELECT m2.lot_id FROM lot_mstr m2 WHERE m2.part_no = l.part_no ORDER BY m2.lot_id LIMIT 1))
FROM shpmt_hdr s
JOIN ord_ln l ON l.ord_id = s.ord_id
WHERE (s.shpmt_id < 8500 AND (s.ord_id NOT IN (5022, 5031, 5079, 5080) OR l.ln_no = 1))
   OR (s.shpmt_id >= 8500 AND l.ln_no > 1);

INSERT INTO invc_hdr (invc_id, invc_no, cust_id, ord_id, invc_typ_cd, invc_dt, due_dt, invc_amt, tax_amt, paid_amt, pay_dt, curr_cd)
SELECT
    v.invc_id,
    'VS-' || to_char(v.invc_dt, 'YYYY') || '-' || lpad(v.invc_id::text, 6, '0'),
    v.cust_id,
    v.ord_id,
    'IN',
    v.invc_dt,
    v.invc_dt + v.net_days,
    v.invc_amt,
    v.tax_amt,
    CASE WHEN v.invc_dt + v.net_days < DATE '2026-05-01' AND v.invc_id % 17 <> 0
         THEN v.invc_amt + v.tax_amt ELSE 0 END,
    CASE WHEN v.invc_dt + v.net_days < DATE '2026-05-01' AND v.invc_id % 17 <> 0
         THEN v.invc_dt + v.net_days - 3 + (v.invc_id % 11) ELSE NULL END,
    'USD'
FROM (
    SELECT
        s.shpmt_id + 2000 AS invc_id,
        h.cust_id,
        h.ord_id,
        s.shp_dt + 2 AS invc_dt,
        t.net_days,
        c.stat_cd,
        c.rgn_cd,
        c.cst_typ_cd,
        COALESCE(SUM(sl.shp_qty * l.unit_px) / 100, 0) AS invc_amt,
        CASE WHEN c.rgn_cd = 'AMER' AND c.cst_typ_cd = '02'
             THEN COALESCE(SUM(sl.shp_qty * l.unit_px) / 100, 0) * 825 / 10000
             ELSE 0 END AS tax_amt
    FROM shpmt_hdr s
    JOIN ord_hdr h ON h.ord_id = s.ord_id
    JOIN cust_mstr c ON c.cust_id = h.cust_id
    JOIN pay_terms t ON t.terms_cd = h.terms_cd
    JOIN shpmt_ln sl ON sl.shpmt_id = s.shpmt_id
    JOIN ord_ln l ON l.ord_id = sl.ord_id AND l.ln_no = sl.ln_no
    WHERE h.ord_stat_cd = 'IV'
    GROUP BY s.shpmt_id, h.cust_id, h.ord_id, s.shp_dt, t.net_days, c.stat_cd, c.rgn_cd, c.cst_typ_cd
) v;

INSERT INTO invc_ln (invc_id, inv_ln_no, ord_id, ln_no, part_no, bil_qty, unit_px, ext_amt)
SELECT
    s.shpmt_id + 2000,
    row_number() OVER (PARTITION BY s.shpmt_id ORDER BY sl.ln_no)::smallint,
    sl.ord_id,
    sl.ln_no,
    sl.part_no,
    sl.shp_qty,
    l.unit_px,
    sl.shp_qty * l.unit_px / 100
FROM shpmt_hdr s
JOIN ord_hdr h ON h.ord_id = s.ord_id
JOIN shpmt_ln sl ON sl.shpmt_id = s.shpmt_id
JOIN ord_ln l ON l.ord_id = sl.ord_id AND l.ln_no = sl.ln_no
WHERE h.ord_stat_cd = 'IV';

INSERT INTO invc_hdr (invc_id, invc_no, cust_id, ord_id, invc_typ_cd, invc_dt, due_dt, invc_amt, tax_amt, paid_amt, pay_dt, curr_cd)
SELECT
    r.cr_invc_id,
    'VS-' || to_char(r.clse_dt, 'YYYY') || '-C' || lpad(r.cr_invc_id::text, 5, '0'),
    r.cust_id,
    o.ord_id,
    'CR',
    r.clse_dt,
    r.clse_dt,
    SUM(l.qty * l.unit_px) / 100,
    0,
    SUM(l.qty * l.unit_px) / 100,
    r.clse_dt,
    'USD'
FROM rma_hdr r
JOIN ord_hdr o ON o.cust_id = r.cust_id AND o.ord_typ_cd = 'RM'
JOIN ord_ln l ON l.ord_id = o.ord_id AND l.part_no = r.part_no
WHERE r.cr_invc_id IS NOT NULL
GROUP BY r.cr_invc_id, r.clse_dt, r.cust_id, o.ord_id;

INSERT INTO invc_ln (invc_id, inv_ln_no, ord_id, ln_no, part_no, bil_qty, unit_px, ext_amt)
SELECT
    r.cr_invc_id,
    1::smallint,
    o.ord_id,
    l.ln_no,
    l.part_no,
    l.qty,
    l.unit_px,
    l.qty * l.unit_px / 100
FROM rma_hdr r
JOIN ord_hdr o ON o.cust_id = r.cust_id AND o.ord_typ_cd = 'RM'
JOIN ord_ln l ON l.ord_id = o.ord_id AND l.part_no = r.part_no
WHERE r.cr_invc_id IS NOT NULL;

INSERT INTO inv_bal (snap_dt, part_no, whs_cd, on_hnd_qty, alloc_qty, on_ord_qty)
SELECT
    d.snap_dt,
    d.part_no,
    d.whs_cd,
    d.on_hnd_qty,
    (d.on_hnd_qty * (5 + (d.h % 36))) / 100,
    CASE WHEN d.h % 4 = 0 THEN 0 ELSE d.moq * (1 + (d.h % 7)) END
FROM (
    SELECT
        s.snap_dt,
        p.part_no,
        p.moq,
        w.whs_cd,
        (length(p.part_no) * 977 + w.ord * 8171 + extract(month FROM s.snap_dt)::int * 613) % 101 AS h,
        p.moq * (1 + ((length(p.part_desc) * 379 + w.ord * 4409 + extract(month FROM s.snap_dt)::int * 227) % 24)) AS on_hnd_qty
    FROM part_mstr p
    CROSS JOIN (VALUES ('DAL1', 1), ('EIN1', 2), ('SIN1', 3), ('OSA1', 4)) AS w(whs_cd, ord)
    CROSS JOIN (VALUES
        (DATE '2026-01-31'), (DATE '2026-02-28'), (DATE '2026-03-31'),
        (DATE '2026-04-30'), (DATE '2026-05-31'), (DATE '2026-06-30')
    ) AS s(snap_dt)
) d;

ANALYZE;

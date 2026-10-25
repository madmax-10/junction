# Comparable discovery

`search_comparable_posts(make, model, year_range=None, mileage_range=None, location=None)` searches exact make/model published, approved Sell snapshots. Optional inclusive integer ranges are caller supplied; omitted ranges impose no subject-derived tolerance. Malformed snapshots, nonfinite/negative prices, synthetic flags, and seed mock.local SellIssue owners are excluded. Only public vehicle evidence is returned, without contact data. These are asking prices, not verified sales; missing synthetic flags do not prove authenticity.

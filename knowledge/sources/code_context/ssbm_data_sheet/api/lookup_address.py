#!/usr/bin/env python3
from _datasheet_lookup import address_query, run_datasheet_search

run_datasheet_search(__file__, query_builder=address_query)

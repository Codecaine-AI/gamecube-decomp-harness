#!/usr/bin/env python3
from _datasheet_lookup import offset_query, run_datasheet_search

run_datasheet_search(__file__, query_builder=offset_query)

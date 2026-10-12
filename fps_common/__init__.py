"""Shared helpers for rstar_builder.py and umax_table_builder.py."""


class InputError(Exception):
    """Bad user input (missing file, unknown channel, invalid range). Exit code 2 in --json mode."""

# Export every reference in the current program as JSON Lines.
# @category GameCube Decomp

import json


def address_text(address):
    return "0x" + str(address)


def primary_symbol_name(symbol_table, address):
    symbol = symbol_table.getPrimarySymbol(address)
    if symbol is None:
        return None
    return str(symbol.getName())


def from_symbol_name(function_manager, symbol_table, address):
    function = function_manager.getFunctionContaining(address)
    if function is not None:
        return str(function.getName())
    return primary_symbol_name(symbol_table, address)


def to_symbol_name(function_manager, symbol_table, address):
    function = function_manager.getFunctionAt(address)
    if function is not None:
        return str(function.getName())
    return primary_symbol_name(symbol_table, address)


script_args = getScriptArgs()
if len(script_args) < 1:
    raise ValueError("ExportXrefs.py requires an output path argument")

output_path = script_args[0]
reference_manager = currentProgram.getReferenceManager()
function_manager = currentProgram.getFunctionManager()
symbol_table = currentProgram.getSymbolTable()
references = reference_manager.getReferenceIterator(currentProgram.getMinAddress())
count = 0
output_file = open(output_path, "w")

try:
    while references.hasNext():
        reference = references.next()
        from_address = address_text(reference.getFromAddress())
        to_address = address_text(reference.getToAddress())
        ref_type = reference.getReferenceType()
        ref_type_text = str(ref_type)
        from_symbol = from_symbol_name(
            function_manager, symbol_table, reference.getFromAddress()
        )
        to_symbol = to_symbol_name(
            function_manager, symbol_table, reference.getToAddress()
        )
        row = {
            "id": "xref:%s:%s" % (from_address, to_address),
            "kind": "ghidra_xref",
            "from_address": from_address,
            "to_address": to_address,
            "ref_type": ref_type_text,
            "is_call": bool(ref_type.isCall()),
            "is_data": bool(ref_type.isData()),
            "from_symbol": from_symbol,
            "to_symbol": to_symbol,
            "text": "%s %s %s %s %s"
            % (from_symbol or "", ref_type_text, to_symbol or "", from_address, to_address),
        }
        output_file.write(json.dumps(row, sort_keys=True))
        output_file.write("\n")
        count += 1
finally:
    output_file.close()

print "EXPORT_XREFS_SUMMARY count=%d output=%s" % (count, output_path)

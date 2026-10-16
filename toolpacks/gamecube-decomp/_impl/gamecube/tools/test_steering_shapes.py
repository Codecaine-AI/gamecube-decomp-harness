"""Tests for steering_shapes.py: one case per shape (steering, directive, real),
the accessor swap moved from sms_fidelity/rules.py, typedef loading and the
statement-complete edit groups. Cases are taken from the #189 temp-hack audit
(objectives/sms-pr189-split/audit/temp-audit) and doldecomp/sms #330."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_shapes as ss  # noqa: E402


def classify(removed, added, **kwargs):
    return ss.classify_group(removed.split('\n') if removed else [], added.split('\n') if added else [], **kwargs)


def shapes(removed, added, **kwargs):
    result = classify(removed, added, **kwargs)
    return result['shapes'], result['real_shapes']


# --------------------------------------------------------------------------
# Steering shapes
# --------------------------------------------------------------------------
def test_temp_with_compound_update_is_one_temp_alias():
    # PR 03 hanasambo: get() * get() split into a local with *=.
    removed = ('\tif (self->getDistToMarioSquared()\n'
               '\t    < self->unk198->mSLAttackDist.get()\n'
               '\t          * self->unk198->mSLAttackDist.get())')
    added = ('\tf32 attackDist = self->unk198->mSLAttackDist.get();\n'
             '\tattackDist *= self->unk198->mSLAttackDist.get();\n'
             '\tif (self->getDistToMarioSquared() < attackDist)')
    result = classify(removed, added)
    assert result['shapes'] == ['temp_alias']
    assert result['real_shapes'] == []
    (finding,) = result['details']['findings']
    assert finding['name'] == 'attackDist' and finding['direction'] == 'introduced' and finding['line'] == 1


# PR 03 hanasambo, as the steering gate passes it: the group's statements plus
# the 30 candidate lines after it. The next nerve declares its own `attackDist`.
ATTACK_REMOVED = ('\t\t\tif (self->getDistToMarioSquared()\n'
                  '\t\t\t    < self->unk198->mSLAttackDist.get()\n'
                  '\t\t\t          * self->unk198->mSLAttackDist.get())')
ATTACK_ADDED = ('\t\t\tf32 attackDist = self->unk198->mSLAttackDist.get();\n'
                '\t\t\tattackDist *= self->unk198->mSLAttackDist.get();\n'
                '\t\t\tif (self->getDistToMarioSquared() < attackDist)')
ATTACK_POST = ('\t\t\t\tspine->pushAfterCurrent(&TNerveHanaSamboAttack::theNerve());\n'
               '\t\t}\n\t\treturn true;\n\t}\n\n'
               '\tself->walkToCurPathNode(0.0f, self->getTurnSpeed() * 3.0f, 0.0f);\n\treturn false;\n}\n\n'
               'DEFINE_NERVE(TNerveHanaSamboWait, TLiveActor)\n{\n'
               '\tTHanaSambo* self = (THanaSambo*)spine->getBody();\n'
               '\tif (spine->getTime() > self->unk198->mSLAttackInterval.get()) {\n'
               '\t\tf32 attackDist = self->unk198->mSLAttackDist.get();\n'
               '\t\tattackDist *= attackDist;\n'
               '\t\tif (self->getDistToMarioSquared() < attackDist) {\n'
               '\t\t\tspine->pushAfterCurrent(&TNerveHanaSamboAttack::theNerve());\n'
               '\t\t\treturn true;\n\t\t}\n\t}')
HIDE_REMOVED = ('\tif (self->getDistToMarioSquared()\n'
                '\t    > self->unk198->mSLHideDist.get() * self->unk198->mSLHideDist.get()) {')
HIDE_ADDED = ('\tf32 hideDist = self->unk198->mSLHideDist.get();\n'
              '\thideDist *= hideDist;\n'
              '\tif (self->getDistToMarioSquared() > hideDist) {')
HIDE_POST = '\t\tspine->pushAfterCurrent(&TNerveHanaSamboHide::theNerve());\n\t\treturn true;\n\t}\n\n\treturn false;\n}'


@pytest.mark.parametrize('removed, added, context', [
    (ATTACK_REMOVED, ATTACK_ADDED, ATTACK_POST),
    (ATTACK_REMOVED, ATTACK_ADDED.replace('*= self->unk198->mSLAttackDist.get()', '*= attackDist'), ATTACK_POST),
    (HIDE_REMOVED, HIDE_ADDED, HIDE_POST),
    (HIDE_REMOVED, HIDE_ADDED.replace('*= hideDist', '*= self->unk198->mSLHideDist.get()'), HIDE_POST),
], ids=['attack-times-call', 'attack-times-temp', 'hide-times-temp', 'hide-times-call'])
def test_compound_temp_with_gate_context_is_steering(removed, added, context):
    # `t = A; t *= A (or t);` then one use is `A * A`. A later function's own
    # local of the same name is another variable, not a use of this temp.
    assert shapes(removed, added, context=context) == (['temp_alias'], [])


@pytest.mark.parametrize('context', [
    # gate post-context: the temp is read again before its block closes
    '\t\t\t\tspine->pushAfterCurrent(&TNerveHanaSamboAttack::theNerve());\n\t\t\tlog(attackDist);\n\t\t}',
    # a span holding the group (a whole function), with a later read
    'void f()\n{\n' + ATTACK_ADDED + '\n\t\t\t\tpush();\n\t\t\tlog(attackDist);\n}',
], ids=['post-context', 'whole-function'])
def test_temp_used_past_the_group_is_not_inlined(context):
    got, real = shapes(ATTACK_REMOVED, ATTACK_ADDED, context=context)
    assert 'temp_alias' not in got and real


def test_temp_in_whole_function_context_without_later_use_is_inlined():
    context = 'void f()\n{\n' + ATTACK_ADDED + '\n\t\t\t\tpush();\n}'
    assert shapes(ATTACK_REMOVED, ATTACK_ADDED, context=context) == (['temp_alias'], [])


def test_compound_temp_with_a_different_factor_stays_real():
    added = ATTACK_ADDED.replace('*= self->unk198->mSLAttackDist.get()', '*= self->unk198->mSLHideDist.get()')
    got, real = shapes(ATTACK_REMOVED, added, context=ATTACK_POST)
    assert real, got


def test_330_single_use_temp_both_directions():
    assert shapes('m_value = param_3->mRotation.x;', 's16 tmp = param_3->mRotation.x;\nm_value = tmp;') == (['temp_alias'], [])
    inlined = classify('s16 tmp = param_3->mRotation.x;\nm_value = tmp;', 'm_value = param_3->mRotation.x;')
    assert inlined['shapes'] == ['temp_alias']
    assert inlined['details']['findings'][0]['direction'] == 'inlined'


def test_temp_name_that_is_also_a_member_is_still_a_temp():
    # PR 10: `z` is a new local even though `.z` is a member on the removed side.
    assert shapes('unk30020[r][c].z = scale * (b2 - a2);', 'f32 z = b2 - a2;\nunk30020[r][c].z = z * scale;') == (['temp_alias', 'operand_order'], [])


def test_value_filled_field_by_field_is_a_temp():
    # PR 04 TGessoPolluteObj::rebirth.
    removed = 'gpPollution->stamp(1, mPosition.x, mPosition.y, mPosition.z, TGesso::mPollRange * 32.0f * 0.5f);'
    added = ('f32 range = 0.5f * (TGesso::mPollRange * 32.0f);\nVec position;\nposition.z = mPosition.z;\n'
             'position.y = mPosition.y;\nposition.x = mPosition.x;\ngpPollution->stamp(1, position.x, position.y, position.z, range);')
    assert shapes(removed, added) == (['temp_alias', 'operand_order'], [])


SET_ROTATION = ('\t\temitter->setRotation(mRotation.x / 180.0f * 32768.0f,\n'
                '\t\t                     mRotation.y / 180.0f * 32768.0f,\n'
                '\t\t                     mRotation.z / 180.0f * 32768.0f);')
ROTATION_TEMP = ('\t\tJGeometry::TVec3<s16> rotation(mRotation.x / 180.0f * 32768.0f,\n'
                 '\t\t                               mRotation.y / 180.0f * 32768.0f,\n'
                 '\t\t                               mRotation.z / 180.0f * 32768.0f);\n')


def test_vector_built_from_the_arguments_and_read_per_field_is_a_temp():
    # PR 29 TMapObjBase::emitAndRotateScale: the constructor is not a call added.
    added = ROTATION_TEMP + '\t\temitter->setRotation(rotation.x, rotation.y, rotation.z);'
    assert shapes(SET_ROTATION, added) == (['temp_alias'], [])


def test_vector_temp_with_fields_out_of_order_stays_real():
    added = ROTATION_TEMP + '\t\temitter->setRotation(rotation.y, rotation.x, rotation.z);'
    assert shapes(SET_ROTATION, added)[1]


def test_store_to_existing_variable_folded_into_its_use():
    # PR 15 isFindMarioFromParam: x *= p; f(x) for f(x * p).
    removed = 'if (isInSight(marioPos, searchLength * param_1, searchAngle))\n\treturn true;'
    added = 'searchLength *= param_1;\nif (isInSight(marioPos, searchLength, searchAngle))\n\treturn true;'
    assert shapes(removed, added) == (['temp_alias'], [])


def test_reference_temp_writes_through():
    removed = 'heightAt(x, z) -= rate * xrem;'
    added = 'f32& h = heightAt(x, z);\nh = h - rate * xrem;'
    assert shapes(removed, added) == (['temp_alias', 'compound_assign_split'], [])


@pytest.mark.parametrize('removed, added, kind', [
    ('mAnmData->createSampleModelData(mModel->getModelData());', 'mAnmData->createSampleModelData(getModel()->getModelData());', 'field_to_accessor'),
    ('unk18[i].mAttnFn = material->getColorChan(i)->getAttnFn();', 'unk18[i].mAttnFn = material->getColorBlock()->getColorChan(i)->getAttnFn();', 'inline_hop_added'),
    ('x = mInstanceIndex;', 'x = getInstanceIndex();', 'field_to_accessor'),
    ('f32 h = getSaveParams()->getSLAttackHeight();', 'f32 h = getSaveParams()->mSLAttackHeight.get();', 'accessor_to_field'),
    # an inline's body written out: add(x) is getChildren().push_back(x)
    ('group->add(unk194);', 'group->getChildren().push_back(unk194);', 'inline_expanded'),
    ('add(unk194);', 'getChildren().push_back(unk194);', 'inline_expanded'),
    ('group->getChildren().push_back(unk194);', 'group->add(unk194);', 'inline_collapsed'),
    # through a temporary built from the same arguments: MsRandF(a, b) is TMsRange<f32>(a, b).rand()
    ('angle = MsRandF(0.0f, 36000.0f);', 'angle = TMsRange<f32>(0.0f, 36000.0f).rand();', 'inline_expanded'),
])
def test_accessor_swap(removed, added, kind):
    result = classify(removed, added)
    assert result['shapes'] == ['accessor_swap'] and result['real_shapes'] == []
    assert result['details']['findings'][0]['detail'] == kind


@pytest.mark.parametrize('removed, added', [
    # PR 03 THanaSambo::init: add() written as its body, C cast as static_cast to the same type.
    ('\t((TIdxGroupObj*)JDrama::TNameRefGen::search("敵グループ"))->add(unk194);',
     '\tstatic_cast<TIdxGroupObj*>(JDrama::TNameRefGen::search("敵グループ"))\n\t    ->getChildren()\n\t    .push_back(unk194);'),
    # PR 03 TNervePakkunStay::execute: MsRandF's body inline, its (int) left to the initializer.
    ('\t\t\tint angle                  = (int)MsRandF(0.0f, 36000.0f);',
     '\t\t\tint angle = TMsRange<f32>(0.0f, 36000.0f).rand();'),
], ids=['add-push_back', 'MsRandF-TMsRange'])
def test_inline_body_with_a_cast_respelling_is_steering(removed, added):
    result = classify(removed, added)
    assert result['shapes'] == ['accessor_swap', 'type_spelling'] and result['real_shapes'] == []


@pytest.mark.parametrize('removed, added', [
    ('\t\tmTargetAngle = rand();', '\t\tmTargetAngle = (u16)rand();'),  # PR 23 TEnemyMario::emWalkAround
    ('return (f32)count;', 'return count;'),
    ('TLiveActor* other = manager->getObj(i);', 'TLiveActor* other = (TLiveActor*)manager->getObj(i);'),
])
def test_explicit_cast_at_a_store_is_type_spelling(removed, added):
    # The store converts to the target type anyway; the IR oracle settles the rare narrowing case.
    result = classify(removed, added)
    assert result['shapes'] == ['type_spelling'] and result['real_shapes'] == []
    assert result['details']['findings'][0]['detail'] == 'explicit_cast'


@pytest.mark.parametrize('removed, added, shape', [
    ('if (x) y = 1; else y = 2;', 'y = x ? 1 : 2;', 'ternary_if'),
    ('y = a + b;', 'y = b + a;', 'operand_order'),
    ('if (a > b) f();', 'if (b < a) f();', 'operand_order'),
    ('a = 1;\nb = 2;', 'b = 2;\na = 1;', 'statement_permutation'),
    ('int alpha = 0;', 's32 alpha = 0;', 'type_spelling'),
    ('push((const char*)"");', 'push("");', 'type_spelling'),
    ('y = x * 0.5f;', 'y = x / 2.0f;', 'float_form'),
    ('y = (i + 1) % sz;', 'y = i + 1 - ((i + 1) / sz) * sz;', 'float_form'),
    ('a = (g >> 24) & 0xF;', 'a = (g & 0x0F000000) >> 24;', 'float_form'),
    ('x += 3;', 'x = x + 3;', 'compound_assign_split'),
    ('if (p != 0) f();', 'if (p) f();', 'bool_form'),
    ('bool result = false;\nif (cond) result = true;', 'bool result = cond;', 'bool_form'),
    ('f32 top;\ntop = y;', 'f32 top = y;', 'decl_reorder'),
])
def test_form_shapes(removed, added, shape):
    got, real = shapes(removed, added)
    assert got == [shape] and real == []


def test_conditional_store_rewritten_as_ternary_local():
    # PR 17 MSHandle::calcDolby: if (c) v = a; ... v  ->  f32 d = c ? a : v; ... d
    removed = 'if (dist < D) {\n\tv = dist * k;\n}\nf32 r = v > 1.0f ? 1.0f : v;'
    added = 'f32 d = dist < D ? dist * k : v;\nf32 r = d > 1.0f ? 1.0f : d;'
    assert shapes(removed, added) == (['temp_alias', 'ternary_if'], [])


def test_early_return_is_a_ternary_if_form():
    removed = ('\t\t} else {\n\t\t\tif (cue & 1) {\n\t\t\t\tcalc();\n\t\t\t}\n\t\t\tif (cue & 2) {\n\t\t\t\tdraw();\n\t\t\t}')
    added = ('\t\t\treturn;\n\t\t}\n\n\t\tif (cue & 1) {\n\t\t\tcalc();\n\t\t}\n\t\tif (cue & 2) {\n\t\t\tdraw();')
    assert shapes(removed, added) == (['ternary_if'], [])


def test_unchanged_if_folds_on_both_sides_are_not_reported():
    removed = 'f32 g = unk16C->g();\nif (unk16C->f == 0)\n\treturn g;\nreturn unk16C->h();'
    added = 'TGesso* gesso = unk16C;\nf32 g = gesso->g();\nif (gesso->f == 0)\n\treturn g;\nreturn gesso->h();'
    assert shapes(removed, added) == (['temp_alias'], [])


def test_comments_and_whitespace_are_cosmetic():
    assert shapes('x = 1; // note', 'x  =  1;') == (['cosmetic'], [])
    assert shapes('if (a) { f(); }', 'if (a)\n\tf();') == (['cosmetic'], [])


# --------------------------------------------------------------------------
# Directives
# --------------------------------------------------------------------------
def test_codegen_directives():
    assert shapes('int x = 1;', 'register int x = 1;')[0] == ['codegen_directive']
    assert shapes('int x = 1;', 'volatile int x = 1;') == (['codegen_directive'], [])
    assert shapes('', '#pragma dont_inline on')[0] == ['codegen_directive']
    found = ss.codegen_directives(['asm { nop }', 'volatile u32* p;', '// volatile in a comment'], removed=['volatile u32* p;'])
    assert [f['detail'] for f in found] == ['asm']


# --------------------------------------------------------------------------
# Real shapes
# --------------------------------------------------------------------------
@pytest.mark.parametrize('removed, added, real', [
    ('f(1);', 'f(2);', 'literal_change'),
    ('x = a->mFoo;', 'x = a->mBar;', 'member_change'),
    ('f(1);', 'g(1);', 'callee_change'),
    ('x = getMaterialName()->getIndex(n);', 'x = getJointName()->getIndex(n);', 'callee_change'),
    ('group->add(x);', 'group->remove(x);', 'callee_change'),
    ('group->add(x);', 'group->getChildren().push_back(y);', 'callee_change'),
    ('group->add(x);', 'other->getChildren().push_back(x);', 'callee_change'),
    ('p = (TFoo*)q;', 'p = static_cast<TBar*>(q);', 'type_change'),
    ('f(index);', 'f((u16)index);', 'type_change'),  # a cast on an argument changes what the callee sees
    ('angle = MsRandF(0.0f, 360.0f);', 'angle = TMsRange<f32>(0.0f, 36000.0f).rand();', 'callee_change'),
    ('angle = MsRandF(a, b);', 'angle = makeRange(a, b).rand();', 'callee_change'),
    ('f();', 'f();\ng();', 'call_added'),
    ('f();\ng();', 'f();', 'call_removed'),
    ('if (a < b) f();', 'if (a <= b) f();', 'condition_change'),
    ('int i = 0;', 'u16 i = 0;', 'type_change'),
    ('static TEntry entry[] = {\n\t{ 1, 2 },\n};', 'static const TEntry entry[] = {\n\t{ 1, 2 },\n};', 'type_change'),
    # cv and storage class, also on a header line whose initializer or body follows (PR 04 bossgesso.cpp)
    ('\tstatic TModelDataLoadEntry entry[] = {', '\tstatic const TModelDataLoadEntry entry[] = {', 'type_change'),
    ('int count = 0;', 'static int count = 0;', 'type_change'),
    ('int gCount;', 'extern int gCount;', 'type_change'),
    ('void f()\n{', 'static void f()\n{', 'type_change'),
    # signatures: return type (PR 09 PacketUtil.cpp), parameter list (PR 06 hx_wiper.c), method const
    ('static void ShapePacketCallBackFunc(J3DCallBackPacket* packet, int draw)\n{',
     'static bool ShapePacketCallBackFunc(J3DCallBackPacket* packet, int draw)\n{', 'type_change'),
    ('static void Hxs_Logo_TexDraw(u16, f32, f32, f32, f32, f32, f32);',
     'static void Hxs_Logo_TexDraw(f32, f32, f32, f32, f32, f32);', 'type_change'),
    ('static void Hxs_Logo_TexDraw(u16 textureWidth, f32 x1, f32 y1,\n                             f32 height)\n{',
     'static void Hxs_Logo_TexDraw(f32 x1, f32 y1,\n                             f32 height)\n{', 'type_change'),
    ('int TFoo::get()\n{', 'int TFoo::get() const\n{', 'type_change'),
    ('x = 1;', 'x = 1;\nreturn;', 'control_flow_change'),
    ('void f()\n{', 'void f()\n{\n}\nvoid g()\n{', 'definition_added_removed'),
    ('int n = count;', 'int n = total;', 'initializer_change'),
])
def test_real_shapes(removed, added, real):
    got, reals = shapes(removed, added)
    assert real in reals, (got, reals)
    assert not set(got) & set(ss.STEERING_SHAPES), got


def test_declared_type_change_stays_real_beside_a_cast_spelling():
    assert shapes('int i = e;', 'u16 i = (u16)e;') == (['type_spelling'], ['type_change'])


def test_parameter_names_are_not_part_of_a_signature():
    assert shapes('void f(J3DCallBackPacket* packet, int draw)\n{', 'void f(J3DCallBackPacket* p, int mode)\n{')[1] == []


def test_constructor_arguments_are_not_parameters():
    # GCConsole2.cpp: `T x(a->b()->c)` constructs a local; changing the argument is an initializer change.
    _, real = shapes('JUTRect bounds(unk2F8->getPane()->mBounds);', 'JUTRect bounds(unk2F8->getPane()->mGlobalBounds);')
    assert 'initializer_change' in real and 'type_change' not in real and 'definition_added_removed' not in real


def test_kuri_land_control_flow_fix_is_real_without_steering():
    # PR 13 TNerveNameKuriLand::execute, the audit's real control-flow fix.
    removed = ('\tif (self->isBckAnm(4) && self->checkCurAnmEnd(0))\n\t\treturn true;\n\n'
               '\tif (!self->isAirborne())\n\t\tself->setBckAnm(4);')
    added = ('\tif (self->isBckAnm(4)) {\n\t\tif (self->checkCurAnmEnd(0))\n\t\t\treturn true;\n'
             '\t} else if (!self->isAirborne())\n\t\tself->setBckAnm(4);')
    got, real = shapes(removed, added)
    assert 'control_flow_change' in real or 'condition_change' in real
    assert not set(got) & set(ss.STEERING_SHAPES)


def test_mixed_group_carries_both():
    # PR 28: a temp plus a real truncating cast.
    removed = 'mNoteEffectMtxPtr = getModel()->getAnmMtx(tab->getIndex(jointName));'
    added = 'int index = tab->getIndex(jointName);\nmNoteEffectMtxPtr = getModel()->getAnmMtx((u16)index);'
    got, real = shapes(removed, added)
    assert got == ['temp_alias'] and real == ['type_change']


def test_unexplained_residue_is_other():
    assert shapes('f32 m[3][2];', 'f32 m2[2];\nf32 m1[2];')[0] == ['other']


# --------------------------------------------------------------------------
# Types, typedefs, groups, compatibility
# --------------------------------------------------------------------------
def test_canonical_type_powerpc_spelling():
    assert ss.canonical_type(['s32']) == ss.canonical_type(['int']) == 'int'
    assert ss.canonical_type(['signed', 'long']) == 'int'
    assert ss.canonical_type(['u32']) == 'unsigned int'
    assert ss.canonical_type(['u16']) != ss.canonical_type(['int'])
    assert ss.canonical_type(['const', 'f32', '*']) == 'const float *'
    assert ss.canonical_type(['volatile', 'int']) == 'int'


def test_load_typedefs_scans_headers_and_falls_back(tmp_path):
    (tmp_path / 'libs/dolphin/include/dolphin').mkdir(parents=True)
    (tmp_path / 'libs/dolphin/include/dolphin/types.h').write_text('typedef signed long s32;\ntypedef unsigned short int u16;\n')
    (tmp_path / 'include').mkdir()
    (tmp_path / 'include/game.h').write_text('typedef s32 TIndex;\ntypedef struct Foo { int a; } Foo;\n// typedef int Commented;\n')
    table = ss.load_typedefs(tmp_path)
    assert table['s32'] == 'int'
    assert table['TIndex'] == 'int'
    assert table['u16'] == 'unsigned short'
    assert table['f32'] == 'float'  # built-in fallback
    assert 'Commented' not in table
    assert shapes('TIndex i = 0;', 'int i = 0;', typedefs=table) == (['type_spelling'], [])


def test_statement_groups_widen_to_whole_statements():
    base = 'void f()\n{\n\tg(a,\n\t  b * k,\n\t  c);\n\th();\n}\n'
    cand = 'void f()\n{\n\tg(a,\n\t  k * b,\n\t  c);\n\th();\n}\n'
    (group,) = ss.statement_groups(base, cand)
    assert group['removed'] == ['\tg(a,', '\t  b * k,', '\t  c);']
    assert group['cand_start'] == 3 and group['cand_end'] == 5
    assert ss.classify_group(group['removed'], group['added'])['shapes'] == ['operand_order']


def test_accessor_swap_keeps_the_rules_py_return_shape():
    tokens = ss.TOKEN.findall
    assert ss.accessor_swap(tokens('x = mModel->f();'), tokens('x = getModel()->f();')) == ('field_to_accessor', 'mModel', 'getModel()')
    assert ss.accessor_swap('a = c->getColorChan(i);', 'a = c->getColorBlock()->getColorChan(i);')[0] == 'inline_hop_added'
    assert ss.accessor_swap(tokens('x = 1;'), tokens('x = 2;')) is None
    # an inline's body written out keeps the four kinds rules.py labels
    assert ss.accessor_swap('g->add(x);', 'g->getChildren().push_back(x);') == ('inline_hop_added', 'add', 'getChildren().push_back')
    assert ss.accessor_swap('g->getChildren().push_back(x);', 'g->add(x);')[0] == 'inline_hop_removed'
    assert ss.accessor_swap('g->add(x);', 'g->remove(x);') is None
    assert ss.accessor_swap('g->add(x);', 'g->getChildren().push_back(y);') is None


def test_tokenizer_skips_comments_and_keeps_strings():
    assert ss.tokenize('a = "// not a comment"; /* gone */ b // gone') == ['a', '=', '"// not a comment"', ';', 'b']

"""Onyx Paint: the 3D Shaders renderer with the game's onyx paint (polished black stone with grey-gold veins) instead of white. (Derived from the Rainbow Paint
renderer, whose docstring follows.)

Rainbow Paint: the 3D Shaders renderer with the game's rainbow paint instead of white. The paint is a hue gradient along the tank's length
(red at the muzzle end, violet at the back) in TANK space, so the body, treads, turret and barrel of every frame (recoil frames included) are one continuous
paint job, shaded, lit and rim-lit in 3D. Output is full colour (the skin is "painted": tint none).

Original docstring: 3D Shaders: renders the TankTrouble tank modelled by asger-finding (tanktrouble-in-3d.blend, CC0) from a straight top-down
orthographic camera, in neutral white, so the game's own colour tint (each player's colours) turns it into a shaded 3D tank.

    blender -b --python render.py -- --source <tanktrouble-in-3d.blend> --out ../render [--samples 128] [--only base,tread,turret0]

The geometry is the .blend's own (tank base, tread links, the six weapon turrets, the homing missile and the booby-trap mine), taken
after its modifiers, at 1 Blender unit = 285 game px; it already matches the game frames. Only the recoil poses (barrels slid back),
the per-barrel recoil of the double barrel and the gatling (three of the model's barrels on the cut turret) are posed here.
Lighting: a soft key from the upper left, an even sky, and a rim-light shader (fresnel edge, strongest on the side away from the key).
Every output is grey (R = G = B): the game multiplies it by the player's colour, so white is the player's colour and shade darkens it.
"""
import bpy, math, sys, os
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(k, d):
    return argv[argv.index(k) + 1] if k in argv else d


SOURCE = opt('--source', '')
OUT = os.path.abspath(opt('--out', '../render'))
SCALE = int(opt('--scale', '4'))
SAMPLES = int(opt('--samples', '128'))
ONLY = opt('--only', 'base,tread,turret0,turret1,turret2').split(',')
K = 285.0                                            # game px per Blender unit (model body 0.2815 long = the game's 80.3 px chassis)

CANVAS = {'base': (68, 84), 'tread': (12, 80), 'turret': (68, 82), 'homingMissile': (32, 44), 'mine': (56, 56), 'mineShrapnel': (20, 20), 'fragment': (40, 40)}
KEY = Vector((-0.55, 0.55, 0.62)).normalized()      # towards the key light: upper left of the image, above the tank
SHADOW = Vector((-0.25, 0.25, 0.94)).normalized()   # the light that casts the turret's drop shadow: same side, much steeper
RIM = Vector((0.72, -0.69, 0.0)).normalized()       # the rim light's side: lower right, opposite the key
RAINBOW = '--grey' not in argv                      # default here: paint the onyx (pass --grey for the plain 3D Shaders output)
GAIN = float(opt('--gain', '1.0'))                   # exposure applied to the grey (the level the player's colour shows at)
ALBEDO = 0.8                                        # the model's own "Flat" material: Principled, base colour 0.8, roughness 0.45, specular 0.6

# objects of the source file used for each frame (names exactly as in tanktrouble-in-3d.blend)
SOURCE_OBJECTS = ['Tank Base', 'Treads Link', 'Default Turret', 'Default Barrel', 'Double Trouble Turret', 'Double Trouble Barrel',
                  'Laser Turret', 'Laser Barrel Half Dome', 'Laser Aimer Tip', 'Shotgun Turret', 'Shotgun Barrel',
                  'Homing Missile Turret', 'Homing Missile Barrel', 'Homing Missile Base', 'Homing Missile Wings',
                  'Booby Trap Turret', 'Booby Trap Extrusions', 'Homing Missile Projectile ', 'Homing Missile Projectile Wings', 'Booby Trap Projectile']
LIGHTS = {}                                          # the current scene's key and shadow lights
MESHES = {}                                          # name -> Mesh in game px, tank centre at the origin, +y = forward (image up)


# ------------------------------------------------------------------ source geometry
def load_source():
    if not SOURCE or not os.path.exists(SOURCE):
        raise SystemExit('pass --source <path to tanktrouble-in-3d.blend> (asger-finding/tanktrouble-in-3d, CC0)')
    bpy.ops.wm.open_mainfile(filepath=SOURCE)
    dg = bpy.context.evaluated_depsgraph_get()
    for name in SOURCE_OBJECTS:
        o = bpy.data.objects[name]
        oe = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=False, depsgraph=dg)
        me.transform(Matrix.Scale(K, 4) @ oe.matrix_world)
        me.materials.clear()
        me.name = 'src ' + name.strip()
        MESHES[name.strip()] = me


def half(me, keep_negative_x=True):
    """A copy of a mirrored mesh with only one side (whole islands, by the sign of x)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    drop = [v for v in bm.verts if (v.co.x > 0) == keep_negative_x]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    out = bpy.data.meshes.new(me.name + (' left' if keep_negative_x else ' right'))
    bm.to_mesh(out)
    bm.free()
    return out


def bounds(me):
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    return co.min(axis=0), co.max(axis=0)


# ------------------------------------------------------------------ scene plumbing
def new_scene(w, h):
    sc = bpy.data.scenes.new('skin')
    r = sc.render
    r.engine = 'CYCLES'
    r.resolution_x = w * SCALE
    r.resolution_y = h * SCALE
    r.resolution_percentage = 100
    r.film_transparent = True
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    c = sc.cycles
    c.device = 'CPU'
    c.samples = SAMPLES
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.max_bounces = 6
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(w, h)
    cam_data.clip_start = 0.1
    cam_data.clip_end = 400
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (0, 0, 100)
    sun = bpy.data.lights.new('key', 'SUN')
    sun.energy = float(opt('--key', '3.2'))
    sun.angle = math.radians(float(opt('--key-angle', '9')))        # a tighter sun: polished stone shows crisp highlights
    so = bpy.data.objects.new('key', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = KEY.to_track_quat('Z', 'Y').to_euler()
    # the turret's drop shadow comes from its own steep, soft light (the shadow pass only): the model's turret stands 24 px tall, and the
    # key's shadow would reach past the canvas
    sh = bpy.data.lights.new('shadow', 'SUN')
    sh.energy = 3.0
    sh.angle = math.radians(30)
    sho = bpy.data.objects.new('shadow', sh)
    sc.collection.objects.link(sho)
    sho.rotation_euler = SHADOW.to_track_quat('Z', 'Y').to_euler()
    sho.hide_render = True
    LIGHTS['key'], LIGHTS['shadow'] = so, sho
    w_ = bpy.data.worlds.new('sky')
    sc.world = w_
    w_.use_nodes = True
    nt = w_.node_tree
    nt.nodes.clear()
    # an even sky, a little brighter overhead than at the horizon, dark below: soft ambient light and occlusion in the creases
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.15
    mr.inputs['From Max'].default_value = 1.0
    mr.inputs['To Min'].default_value = 0.05
    mr.inputs['To Max'].default_value = float(opt('--sky', '0.55'))
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], bg.inputs['Strength'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return sc


def lin(c):
    """sRGB 0..1 -> linear (Blender node colours are linear)."""
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


# the game's rainbow paint, front (t = 0) to back (t = 1) of the tank: red, orange, yellow, green, cyan, blue, violet, magenta
RAINBOW_STOPS = [(0.00, (0.96, 0.05, 0.03)), (0.13, (1.00, 0.42, 0.00)), (0.27, (1.00, 0.86, 0.00)), (0.41, (0.20, 0.88, 0.08)),
                 (0.55, (0.00, 0.86, 0.95)), (0.70, (0.06, 0.25, 1.00)), (0.86, (0.58, 0.10, 0.90)), (1.00, (0.85, 0.12, 0.72))]


def onyx_colour(nt, half):
    """Polished black onyx: a near-black base with slow tonal clouds, and thin, wavering veins of grey-olive and pale gold running diagonally across the stone
    (the veins are 3D: they follow the position on the tank, so a barrel, a dome and a tread link all belong to one block of stone)."""
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    big = nt.nodes.new('ShaderNodeTexNoise')                      # slow distortion, so the veins wander
    big.inputs['Scale'].default_value = float(opt('--wander', '0.035'))
    big.inputs['Detail'].default_value = 3.0
    big.inputs['Roughness'].default_value = 0.55
    fine = nt.nodes.new('ShaderNodeTexNoise')                     # finer waviness along each vein
    fine.inputs['Scale'].default_value = 0.16
    fine.inputs['Detail'].default_value = 2.0
    add1 = nt.nodes.new('ShaderNodeVectorMath')
    add1.operation = 'MULTIPLY_ADD'
    add1.inputs[1].default_value = (float(opt('--warp', '40')),) * 3
    nt.links.new(geo.outputs['Position'], add1.inputs[2])
    nt.links.new(big.outputs['Color'], add1.inputs[0])
    add2 = nt.nodes.new('ShaderNodeVectorMath')
    add2.operation = 'MULTIPLY_ADD'
    add2.inputs[1].default_value = (2.2, 2.2, 2.2)
    nt.links.new(add1.outputs['Vector'], add2.inputs[2])
    nt.links.new(fine.outputs['Color'], add2.inputs[0])
    nt.links.new(add1.outputs['Vector'], fine.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'DIAGONAL'
    wave.wave_profile = 'SIN'
    wave.inputs['Scale'].default_value = float(opt('--veins', '0.026'))
    wave.inputs['Distortion'].default_value = 2.5
    wave.inputs['Detail'].default_value = 2.0
    wave.inputs['Detail Scale'].default_value = 1.2
    nt.links.new(add2.outputs['Vector'], wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')                      # mostly stone, with narrow bright lines near the crest of each band
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, lin((0.060, 0.061, 0.066))
    el[1].position, el[1].color = 0.62, lin((0.085, 0.086, 0.090))
    for pos, c in [(0.75, (0.16, 0.16, 0.14)), (0.85, (0.36, 0.35, 0.28)), (0.925, (0.52, 0.50, 0.39)), (0.975, (0.28, 0.27, 0.22)), (1.0, (0.075, 0.075, 0.08))]:
        e = el.new(pos)
        e.color = lin(c)
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    return ramp.outputs['Color']


def mat_shader(name, albedo=ALBEDO, rough=0.45, rim=1.0, half=42.0):
    """The model's material in white, with a rim light: a fresnel edge, full strength on the side facing RIM and a third of it elsewhere."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (albedo, albedo, albedo, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.6
    b.inputs['Coat Weight'].default_value = 0.25
    b.inputs['Coat Roughness'].default_value = 0.3
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    edge = nt.nodes.new('ShaderNodeMapRange')            # 0 where the surface faces the camera, 1 at the silhouette
    edge.interpolation_type = 'SMOOTHSTEP'
    edge.inputs['From Min'].default_value = float(opt('--rim-from', '0.25'))
    edge.inputs['From Max'].default_value = 0.92
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = tuple(RIM)
    side = nt.nodes.new('ShaderNodeMapRange')            # how much the surface faces the rim side: 1/3 .. 1
    side.inputs['From Min'].default_value = -0.3
    side.inputs['From Max'].default_value = 0.8
    side.inputs['To Min'].default_value = 0.33
    side.inputs['To Max'].default_value = 1.0
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    gain = nt.nodes.new('ShaderNodeMath')
    gain.operation = 'MULTIPLY'
    gain.inputs[1].default_value = float(opt('--rim', '2.4')) * rim
    nt.links.new(lw.outputs['Facing'], edge.inputs['Value'])
    nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    nt.links.new(dot.outputs['Value'], side.inputs['Value'])
    nt.links.new(edge.outputs['Result'], mul.inputs[0])
    nt.links.new(side.outputs['Result'], mul.inputs[1])
    nt.links.new(mul.outputs['Value'], gain.inputs[0])
    if RAINBOW:
        col = onyx_colour(nt, half)
        nt.links.new(col, b.inputs['Base Color'])
        b.inputs['Emission Color'].default_value = (0.55, 0.6, 0.7, 1)   # a faint cool rim, so the dark stone keeps its edge
        gain.inputs[1].default_value = float(opt('--rim', '0.12')) * rim
        b.inputs['Roughness'].default_value = float(opt('--rough', '0.16'))
        b.inputs['Coat Weight'].default_value = 1.0
        b.inputs['Coat Roughness'].default_value = 0.04
        b.inputs['Specular IOR Level'].default_value = 0.9
    else:
        b.inputs['Emission Color'].default_value = (1, 1, 1, 1)
    nt.links.new(gain.outputs['Value'], b.inputs['Emission Strength'])
    return m


def mat_dark(name='dark'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
    b.inputs['Roughness'].default_value = 0.6
    return m


def place(sc, src, mat, offset=(0, 0, 0), name=None, xform=None, camera=True, keep=None):
    """Put a copy of a source mesh in the scene, moved by `offset` (game px) after an optional local transform."""
    me = src.copy() if keep is None else half(src, keep)
    if xform is not None:
        me.transform(xform)
    me.materials.clear()
    me.materials.append(mat)
    o = bpy.data.objects.new(name or src.name, me)
    o.location = offset
    sc.collection.objects.link(o)
    if not camera:                                   # a shadow caster only
        for attr in ('visible_camera', 'visible_glossy', 'visible_diffuse', 'visible_transmission', 'visible_volume_scatter'):
            setattr(o, attr, False)
    return o


def catcher(sc, w, h, z):
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=1.0)
    for v in bm.verts:
        v.co.x *= w * 0.5
        v.co.y *= h * 0.5
    me = bpy.data.meshes.new('catcher')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('catcher', me)
    o.location = (0, 0, z)
    o.is_shadow_catcher = True
    o.visible_glossy = False
    sc.collection.objects.link(o)
    return o


# ------------------------------------------------------------------ frames
# Canvas centre in tank space: base (0, 0), tread (-26, 0) for the left one, turret (0, -16) i.e. 16 px forward of the tank centre.
TURRET_DY = -15.35                                   # measured: the model's turret sits 0.65 px behind the game's


def barrel_pose(me, back=0.0, widen=1.0):
    """Slide a barrel back by `back` px and widen it about its own axis (the recoil frames: the game's barrel gets shorter and fatter)."""
    lo, hi = bounds(me)
    ax = (lo[0] + hi[0]) / 2
    az = (lo[2] + hi[2]) / 2
    return (Matrix.Translation((0, -back, 0)) @ Matrix.Translation((ax, 0, az)) @ Matrix.Diagonal((widen, 1.0, 1.0 + (widen - 1) * 0.35, 1.0))
            @ Matrix.Translation((-ax, 0, -az)))


def frame_base(sc):
    place(sc, MESHES['Tank Base'], mat_shader('base'))           # the turret's frame carries the turret's shadow (it turns with the turret)


def frame_tread(sc):
    me = MESHES['Treads Link']
    lo, hi = bounds(half(me, True))
    cx = (lo[0] + hi[0]) / 2
    place(sc, me, mat_shader('tread', rough=0.55, half=40.0), offset=(-cx, 0, 0), keep=True)


def turret_parts(idx):
    """[(source mesh name, local transform or None, half or None)] for turret frame idx."""
    if idx <= 2:
        back, widen = [(0.0, 1.0), (14.0, 1.32), (4.0, 1.18)][idx]
        return [('Default Turret', None, None), ('Default Barrel', barrel_pose(MESHES['Default Barrel'], back, widen), None)]
    if idx == 3:
        return [('Laser Turret', None, None), ('Laser Barrel Half Dome', None, None), ('Laser Aimer Tip', None, None)]
    if idx <= 8:                                     # double barrel: 4 idle; 5, 6 left barrel recoil; 7, 8 right barrel recoil
        left, right = {4: (0, 0), 5: (19.3, 0), 6: (5.7, 0), 7: (0, 19.3), 8: (0, 5.7)}[idx]
        return [('Double Trouble Turret', None, None), ('Double Trouble Barrel', Matrix.Translation((0, -left, 0)), True),
                ('Double Trouble Barrel', Matrix.Translation((0, -right, 0)), False)]
    if idx <= 11:                                    # shotgun 9 idle, 10 and 11 recoil
        back = {9: 0.0, 10: 12.0, 11: 21.7}[idx]
        return [('Shotgun Turret', None, None), ('Shotgun Barrel', Matrix.Translation((0, -back, 0)), None)]
    if idx == 12:
        return [('Homing Missile Turret', None, None), ('Homing Missile Barrel', None, None), ('Homing Missile Base', None, None), ('Homing Missile Wings', None, None)]
    if idx == 13:
        return [('Homing Missile Turret', None, None), ('Homing Missile Barrel', None, None)]
    if idx == 14:
        return [('Booby Trap Turret', None, None), ('Booby Trap Extrusions', None, None)]
    # gatling (15, 16): not in the model; three of its own default barrels, thinned, on the cut double-barrel turret; the middle one alternates
    me = MESHES['Default Barrel']
    lo, hi = bounds(me)
    ax, az = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    parts = [('Double Trouble Turret', None, None)]
    for k, x in enumerate((-11.1, 0.0, 11.1)):
        back = (8.0 if k != 1 else 6.0) if idx == 15 else (6.0 if k != 1 else 8.0)
        m = (Matrix.Translation((x, -back, 0)) @ Matrix.Translation((ax, 0, az)) @ Matrix.Diagonal((0.62, 1.0, 0.62, 1.0)) @ Matrix.Translation((-ax, 0, -az)))
        parts.append(('Default Barrel', m, None))
    return parts


def frame_turret(sc, idx):
    white = mat_shader('turret', half=41.0)
    dark = mat_dark('aimer')
    for name, xf, keep in turret_parts(idx):
        place(sc, MESHES[name], dark if name == 'Laser Aimer Tip' else white, offset=(0, TURRET_DY, 0), xform=xf, keep=keep)     # the laser's aimer stays black, as in the game
    lo, _ = bounds(MESHES['Default Turret'])
    return catcher(sc, 68 * 4, 82 * 4, lo[2] - 0.5)


def frame_missile(sc):
    white = mat_shader('missile', half=22.0)
    body, wings = MESHES['Homing Missile Projectile'], MESHES['Homing Missile Projectile Wings']
    lo, hi = bounds(body)
    # nose tip at canvas y 2.9 (its rounded point then matches the game's at 3.3) (canvas 44 high: world y = 22 - 3.7), centred in x and laid on the ground
    off = (-(lo[0] + hi[0]) / 2, 22 - 2.9 - hi[1], -lo[2])
    place(sc, body, white, offset=off)
    place(sc, wings, white, offset=off)


def frame_mine(sc):
    white = mat_shader('mine', half=28.0)
    me = MESHES['Booby Trap Projectile']
    lo, hi = bounds(me)
    s = float(opt('--mine-scale', '0.815'))
    place(sc, me, white, xform=Matrix.Scale(s, 4), offset=(-(lo[0] + hi[0]) / 2 * s, 0.0, 0))


def solid(sc, me, mat, name):
    """Link a finished mesh (flat-shaded facets, so every facet catches the light differently) into the scene."""
    me.materials.clear()
    me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', [False] * len(me.polygons))
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    return o


def frame_shrapnel(sc):
    """The mine's shrapnel (20x20): a flat pyramid seen from above, apex over the middle of the triangle (the game's is a 12 x 9.7 px triangle)."""
    import bmesh
    ix, iy = (lambda v: v - 10.0), (lambda v: 10.0 - v)
    bm = bmesh.new()
    a, b, c = bm.verts.new((ix(10.0), iy(2.5), 0.0)), bm.verts.new((ix(3.6), iy(13.9), 0.0)), bm.verts.new((ix(16.4), iy(13.9), 0.0))
    top = bm.verts.new((ix(10.0), iy(10.0), 3.6))
    for tri in ((a, b, top), (b, c, top), (c, a, top)):
        bm.faces.new(tri)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('shard')
    bm.to_mesh(me)
    bm.free()
    solid(sc, me, mat_shader('shrapnel', half=10.0), 'shard')


def frame_fragment(sc, idx):
    """A piece of an exploded tank (40x40): a random convex faceted shard, painted with the rainbow like the tank."""
    import bmesh, random
    rnd = random.Random(900 + idx * 37)
    n = 5 + idx % 3
    rot = rnd.random() * math.tau
    bm = bmesh.new()
    for k in range(n):
        a = rot + (k / n) * math.tau + (rnd.random() - 0.5) * 0.5
        r = 7.0 + rnd.random() * 11.0
        bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0))
    bm.verts.new((rnd.uniform(-3, 3), rnd.uniform(-3, 3), 4.5 + rnd.random() * 2.0))
    bm.verts.new((rnd.uniform(-3, 3), rnd.uniform(-3, 3), -2.0))
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    loose = [e for e in {id(e): e for e in res['geom_interior'] + res['geom_unused']}.values() if isinstance(e, bmesh.types.BMVert) and e.is_valid]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new('shard')
    bm.to_mesh(me)
    bm.free()
    solid(sc, me, mat_shader('fragment', half=20.0), 'fragment')


# ------------------------------------------------------------------ output
def to_grey(path, mask_path=None, shadow=False):
    """R = G = B = luminance (the game tints it); with a mask render (no shadow catcher) the object's pixels come from it and every other pixel is the soft black shadow."""
    im = bpy.data.images.load(path)
    a = np.empty(len(im.pixels), np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(-1, 4)
    out = a.copy()
    w, h = im.size
    if mask_path:
        mk = bpy.data.images.load(mask_path)
        m = np.empty(len(mk.pixels), np.float32)
        mk.pixels.foreach_get(m)
        m = m.reshape(-1, 4)
        # the shadow: black, soft, without the catcher's faint floor, fading out over the last 3 px (1x) before the canvas edge so it never ends in a cut line
        yy, xx = np.mgrid[0:h, 0:w]
        edge = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).ravel() / (3.0 * SCALE)
        fade = np.clip(edge, 0, 1) ** 2
        out[:, :3] = 0.0
        out[:, 3] = np.clip((a[:, 3] - 0.04) / 0.96, 0, 1) * float(opt('--shadow', '0.45')) * fade
        obj = m[:, 3] > 0.002
        out[obj] = m[obj]
        bpy.data.images.remove(mk)
        os.remove(mask_path)
    if RAINBOW:                                      # painted: keep the colour (the skin is shown exactly as rendered)
        out[:, :3] = np.clip(out[:, :3] * GAIN, 0, 1)
    else:
        lum = (out[:, 0] * 0.2126 + out[:, 1] * 0.7152 + out[:, 2] * 0.0722) * GAIN
        out[:, 0] = out[:, 1] = out[:, 2] = np.clip(lum, 0, 1)
    im.pixels.foreach_set(out.ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)


def main():
    load_source()
    os.makedirs(OUT, exist_ok=True)
    for name in ONLY:
        kind = 'turret' if name.startswith('turret') else 'fragment' if name.startswith('fragment') else name
        cw, ch = CANVAS[kind]
        sc = new_scene(cw, ch)
        catch = None
        if name == 'base':
            frame_base(sc)
        elif name == 'tread':
            frame_tread(sc)
        elif name == 'homingMissile':
            frame_missile(sc)
        elif name == 'mine':
            frame_mine(sc)
        elif name == 'mineShrapnel':
            frame_shrapnel(sc)
        elif name.startswith('fragment'):
            frame_fragment(sc, int(name[8:]))
        else:
            catch = frame_turret(sc, int(name[6:]))
        path = os.path.join(OUT, name + '.png')
        mask = None
        if catch is not None:                        # shadow pass: the floor catches the steep light's shadow
            key, shadow = LIGHTS['key'], LIGHTS['shadow']
            key.hide_render, shadow.hide_render = True, False
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True, scene=sc.name)
            key.hide_render, shadow.hide_render, catch.hide_render = False, True, True
            mask = os.path.join(OUT, name + '.mask.png')
            sc.render.filepath = mask                # object pass: no floor, the key light; it gives the object's pixels and exact coverage
        else:
            sc.render.filepath = path
        bpy.ops.render.render(write_still=True, scene=sc.name)
        to_grey(path, mask)
        bpy.data.scenes.remove(sc)
        print('rendered', name, flush=True)


main()

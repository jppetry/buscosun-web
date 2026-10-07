"""Independent decode of DWD SWIS bulletins with eccodes: one JSON object per subset, keys in data order."""
import sys, json, re
import eccodes as ec

def subsets(path):
    out = []
    with open(path, 'rb') as f:
        while True:
            h = ec.codes_bufr_new_from_file(f)
            if h is None:
                break
            ec.codes_set(h, 'unpack', 1)
            n = ec.codes_get(h, 'numberOfSubsets')
            it = ec.codes_bufr_keys_iterator_new(h)
            seq = []
            started = False
            while ec.codes_bufr_keys_iterator_next(it):
                k = ec.codes_bufr_keys_iterator_get_name(it)
                if '->' in k:
                    continue
                if not k.startswith('#'):
                    continue
                try:
                    sz = ec.codes_get_size(h, k)
                    if sz > 1:
                        v = list(ec.codes_get_array(h, k))
                    else:
                        v = ec.codes_get(h, k)
                except Exception as e:  # noqa
                    v = None
                if isinstance(v, float) and v == ec.CODES_MISSING_DOUBLE:
                    v = None
                if isinstance(v, int) and v == ec.CODES_MISSING_LONG:
                    v = None
                seq.append((re.sub(r'^#\d+#', '', k), v))
            ec.codes_bufr_keys_iterator_delete(it)
            ec.codes_release(h)
            # split into subsets: a subset starts at each occurrence of the first key name
            first = seq[0][0] if seq else None
            cur = None
            for name, v in seq:
                if name == first:
                    cur = []
                    out.append(cur)
                cur.append([name, v])
            if len(out) and n and len([1 for s in out]) < n:
                pass
    return out

if __name__ == '__main__':
    res = {}
    for p in sys.argv[1:]:
        res[p] = subsets(p)
    json.dump(res, sys.stdout, default=str)

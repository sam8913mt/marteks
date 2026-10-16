#!/usr/bin/env python3
"""Conservative JS minifier: strips comments + indentation/blank lines. Keeps newlines (ASI-safe)."""
import re, sys
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^') 
KW = ('return','typeof','case','in','of','delete','void','throw','else','do','new')
def minify(src):
    out=[]; i=0; n=len(src); prev=''   # last significant char
    last_word=''
    while i<n:
        c=src[i]
        if c in '"\'':
            q=c; j=i+1
            while j<n:
                if src[j]=='\\': j+=2; continue
                if src[j]==q: break
                j+=1
            out.append(src[i:j+1]); i=j+1; prev='"'; last_word=''; continue
        if c=='`':
            j=i+1
            while j<n:
                if src[j]=='\\': j+=2; continue
                if src[j]=='`': break
                j+=1
            out.append(src[i:j+1]); i=j+1; prev='"'; last_word=''; continue
        if c=='/' and i+1<n and src[i+1]=='/':
            j=src.find('\n',i); i = n if j<0 else j; continue
        if c=='/' and i+1<n and src[i+1]=='*':
            j=src.find('*/',i+2); i = n if j<0 else j+2; continue
        if c=='/':
            if prev=='' or prev in REGEX_PREV or last_word in KW:
                j=i+1; cls=False
                while j<n:
                    ch=src[j]
                    if ch=='\\': j+=2; continue
                    if ch=='[': cls=True
                    elif ch==']': cls=False
                    elif ch=='/' and not cls: break
                    j+=1
                j+=1
                while j<n and (src[j].isalpha()): j+=1
                out.append(src[i:j]); i=j; prev='"'; last_word=''; continue
        out.append(c)
        if c.isalnum() or c in '_$':
            k=i
            while k>=0 and (src[k].isalnum() or src[k] in '_$'): k-=1
            last_word=src[k+1:i+1]
        elif not c.isspace():
            last_word=''
        if not c.isspace(): prev=c
        i+=1
    text=''.join(out)
    lines=[re.sub(r'^[ \t]+|[ \t]+$','',l) for l in text.split('\n')]
    return '\n'.join(l for l in lines if l)+'\n'
if __name__=='__main__':
    open(sys.argv[2],'w',encoding='utf-8').write(minify(open(sys.argv[1],encoding='utf-8').read()))

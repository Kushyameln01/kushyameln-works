(module
  (type (;0;) (func (param f32) (result i32)))
  (type (;1;) (func (param i32) (result f32)))
  (type (;2;) (func (param i32 i32 i32 i32) (result i32)))
  (type (;3;) (func (param i32 i32) (result i32)))
  (func (;0;) (type 0) (param f32) (result i32)
    (local i32 i32 f32 f32 i32 f32 f32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 13
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 12
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 9 (;@1;)
                      end
                      global.get 0
                      local.set 1
                      global.get 0
                      i32.const 4
                      i32.add
                      global.set 0
                      local.get 1
                      local.get 0
                      f32.store
                      global.get 0
                      local.set 2
                      global.get 0
                      i32.const 1
                      i32.add
                      global.set 0
                      local.get 2
                      i32.const 0
                      i32.store8
                      local.get 1
                      f32.load
                      local.set 3
                      local.get 1
                      f32.load
                      local.set 4
                      local.get 3
                      local.get 4
                      f32.eq
                      local.set 5
                      local.get 5
                      if  ;; label = @10
                        i32.const 3
                        local.set 12
                        br 8 (;@2;)
                      else
                        i32.const 4
                        local.set 12
                        br 8 (;@2;)
                      end
                    end
                    local.get 13
                    global.set 0
                    i32.const 0
                    return
                  end
                  i32.const 7
                  local.set 12
                  br 5 (;@2;)
                end
                local.get 1
                f32.load
                local.set 6
                local.get 1
                f32.load
                local.set 7
                local.get 6
                local.get 7
                f32.sub
                local.set 8
                i32.const 0
                f32.convert_i32_s
                local.set 9
                local.get 8
                local.get 9
                f32.eq
                local.set 10
                local.get 2
                local.get 10
                i32.store8
                i32.const 5
                local.set 12
                br 4 (;@2;)
              end
              i32.const 5
              local.set 12
              br 3 (;@2;)
            end
            local.get 2
            i32.load8_u
            local.set 11
            local.get 13
            global.set 0
            local.get 11
            return
          end
          i32.const 2
          local.set 12
          br 1 (;@2;)
        end
        i32.const 1
        local.set 12
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;1;) (type 1) (param i32) (result f32)
    (local i32 i32 i32 i32 i32 f64 f32 i32 i32 f64 f32 i32 i32 f64 f32 i32 i32 f32 i32 i32 f64 f32 i32 i32 f32 i32 i32 f64 f32 i32 i32 f32 i32 i32 f32 i32 i32 f64 f32 i32 i32 f32 i32 i32 f64 f32 i32 i32 f64 f32 i32 i32 f64 f32 f64 f32 f32 i32 i32)
    global.get 0
    local.set 59
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            block  ;; label = @61
                                                                                                                              block  ;; label = @62
                                                                                                                                block  ;; label = @63
                                                                                                                                  block  ;; label = @64
                                                                                                                                    block  ;; label = @65
                                                                                                                                      block  ;; label = @66
                                                                                                                                        block  ;; label = @67
                                                                                                                                          block  ;; label = @68
                                                                                                                                            block  ;; label = @69
                                                                                                                                              block  ;; label = @70
                                                                                                                                                block  ;; label = @71
                                                                                                                                                  block  ;; label = @72
                                                                                                                                                    block  ;; label = @73
                                                                                                                                                      block  ;; label = @74
                                                                                                                                                        block  ;; label = @75
                                                                                                                                                          block  ;; label = @76
                                                                                                                                                            block  ;; label = @77
                                                                                                                                                              block  ;; label = @78
                                                                                                                                                                block  ;; label = @79
                                                                                                                                                                  block  ;; label = @80
                                                                                                                                                                    block  ;; label = @81
                                                                                                                                                                      block  ;; label = @82
                                                                                                                                                                        local.get 58
                                                                                                                                                                        br_table 0 (;@82;) 1 (;@81;) 2 (;@80;) 3 (;@79;) 4 (;@78;) 5 (;@77;) 6 (;@76;) 7 (;@75;) 8 (;@74;) 9 (;@73;) 10 (;@72;) 11 (;@71;) 12 (;@70;) 13 (;@69;) 14 (;@68;) 15 (;@67;) 16 (;@66;) 17 (;@65;) 18 (;@64;) 19 (;@63;) 20 (;@62;) 21 (;@61;) 22 (;@60;) 23 (;@59;) 24 (;@58;) 25 (;@57;) 26 (;@56;) 27 (;@55;) 28 (;@54;) 29 (;@53;) 30 (;@52;) 31 (;@51;) 32 (;@50;) 33 (;@49;) 34 (;@48;) 35 (;@47;) 36 (;@46;) 37 (;@45;) 38 (;@44;) 39 (;@43;) 40 (;@42;) 41 (;@41;) 42 (;@40;) 43 (;@39;) 44 (;@38;) 45 (;@37;) 46 (;@36;) 47 (;@35;) 48 (;@34;) 49 (;@33;) 50 (;@32;) 51 (;@31;) 52 (;@30;) 53 (;@29;) 54 (;@28;) 55 (;@27;) 56 (;@26;) 57 (;@25;) 58 (;@24;) 59 (;@23;) 60 (;@22;) 61 (;@21;) 62 (;@20;) 63 (;@19;) 64 (;@18;) 65 (;@17;) 66 (;@16;) 67 (;@15;) 68 (;@14;) 69 (;@13;) 70 (;@12;) 71 (;@11;) 72 (;@10;) 73 (;@9;) 74 (;@8;) 75 (;@7;) 76 (;@6;) 77 (;@5;) 78 (;@4;) 79 (;@3;) 81 (;@1;)
                                                                                                                                                                      end
                                                                                                                                                                      global.get 0
                                                                                                                                                                      local.set 1
                                                                                                                                                                      global.get 0
                                                                                                                                                                      i32.const 4
                                                                                                                                                                      i32.add
                                                                                                                                                                      global.set 0
                                                                                                                                                                      local.get 1
                                                                                                                                                                      local.get 0
                                                                                                                                                                      i32.store
                                                                                                                                                                      local.get 1
                                                                                                                                                                      i32.load
                                                                                                                                                                      local.set 2
                                                                                                                                                                      local.get 2
                                                                                                                                                                      i32.const 0
                                                                                                                                                                      i32.eq
                                                                                                                                                                      local.set 3
                                                                                                                                                                      local.get 3
                                                                                                                                                                      if  ;; label = @82
                                                                                                                                                                        i32.const 3
                                                                                                                                                                        local.set 58
                                                                                                                                                                        br 80 (;@2;)
                                                                                                                                                                      else
                                                                                                                                                                        i32.const 4
                                                                                                                                                                        local.set 58
                                                                                                                                                                        br 80 (;@2;)
                                                                                                                                                                      end
                                                                                                                                                                    end
                                                                                                                                                                    local.get 59
                                                                                                                                                                    global.set 0
                                                                                                                                                                    f32.const 0x0p+0 (;=0;)
                                                                                                                                                                    return
                                                                                                                                                                  end
                                                                                                                                                                  local.get 1
                                                                                                                                                                  i32.load
                                                                                                                                                                  local.set 4
                                                                                                                                                                  local.get 4
                                                                                                                                                                  i32.const 1
                                                                                                                                                                  i32.eq
                                                                                                                                                                  local.set 5
                                                                                                                                                                  local.get 5
                                                                                                                                                                  if  ;; label = @80
                                                                                                                                                                    i32.const 8
                                                                                                                                                                    local.set 58
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  else
                                                                                                                                                                    i32.const 9
                                                                                                                                                                    local.set 58
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  end
                                                                                                                                                                end
                                                                                                                                                                f64.const 0x0p+0 (;=0;)
                                                                                                                                                                f64.const 0x1.83a29c779a6b5p-1 (;=0.7571;)
                                                                                                                                                                f64.sub
                                                                                                                                                                local.set 6
                                                                                                                                                                local.get 6
                                                                                                                                                                f32.demote_f64
                                                                                                                                                                local.set 7
                                                                                                                                                                local.get 59
                                                                                                                                                                global.set 0
                                                                                                                                                                local.get 7
                                                                                                                                                                return
                                                                                                                                                              end
                                                                                                                                                              i32.const 5
                                                                                                                                                              local.set 58
                                                                                                                                                              br 75 (;@2;)
                                                                                                                                                            end
                                                                                                                                                            i32.const 2
                                                                                                                                                            local.set 58
                                                                                                                                                            br 74 (;@2;)
                                                                                                                                                          end
                                                                                                                                                          i32.const 5
                                                                                                                                                          local.set 58
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        end
                                                                                                                                                        local.get 1
                                                                                                                                                        i32.load
                                                                                                                                                        local.set 8
                                                                                                                                                        local.get 8
                                                                                                                                                        i32.const 2
                                                                                                                                                        i32.eq
                                                                                                                                                        local.set 9
                                                                                                                                                        local.get 9
                                                                                                                                                        if  ;; label = @75
                                                                                                                                                          i32.const 13
                                                                                                                                                          local.set 58
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        else
                                                                                                                                                          i32.const 14
                                                                                                                                                          local.set 58
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        end
                                                                                                                                                      end
                                                                                                                                                      f64.const 0x0p+0 (;=0;)
                                                                                                                                                      f64.const 0x1.6af4f0d844d01p-1 (;=0.7089;)
                                                                                                                                                      f64.sub
                                                                                                                                                      local.set 10
                                                                                                                                                      local.get 10
                                                                                                                                                      f32.demote_f64
                                                                                                                                                      local.set 11
                                                                                                                                                      local.get 59
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 11
                                                                                                                                                      return
                                                                                                                                                    end
                                                                                                                                                    i32.const 10
                                                                                                                                                    local.set 58
                                                                                                                                                    br 70 (;@2;)
                                                                                                                                                  end
                                                                                                                                                  i32.const 7
                                                                                                                                                  local.set 58
                                                                                                                                                  br 69 (;@2;)
                                                                                                                                                end
                                                                                                                                                i32.const 10
                                                                                                                                                local.set 58
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                              local.get 1
                                                                                                                                              i32.load
                                                                                                                                              local.set 12
                                                                                                                                              local.get 12
                                                                                                                                              i32.const 3
                                                                                                                                              i32.eq
                                                                                                                                              local.set 13
                                                                                                                                              local.get 13
                                                                                                                                              if  ;; label = @70
                                                                                                                                                i32.const 18
                                                                                                                                                local.set 58
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              else
                                                                                                                                                i32.const 19
                                                                                                                                                local.set 58
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                            end
                                                                                                                                            f64.const 0x0p+0 (;=0;)
                                                                                                                                            f64.const 0x1.d295e9e1b089ap-1 (;=0.9113;)
                                                                                                                                            f64.sub
                                                                                                                                            local.set 14
                                                                                                                                            local.get 14
                                                                                                                                            f32.demote_f64
                                                                                                                                            local.set 15
                                                                                                                                            local.get 59
                                                                                                                                            global.set 0
                                                                                                                                            local.get 15
                                                                                                                                            return
                                                                                                                                          end
                                                                                                                                          i32.const 15
                                                                                                                                          local.set 58
                                                                                                                                          br 65 (;@2;)
                                                                                                                                        end
                                                                                                                                        i32.const 12
                                                                                                                                        local.set 58
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                      i32.const 15
                                                                                                                                      local.set 58
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    end
                                                                                                                                    local.get 1
                                                                                                                                    i32.load
                                                                                                                                    local.set 16
                                                                                                                                    local.get 16
                                                                                                                                    i32.const 4
                                                                                                                                    i32.eq
                                                                                                                                    local.set 17
                                                                                                                                    local.get 17
                                                                                                                                    if  ;; label = @65
                                                                                                                                      i32.const 23
                                                                                                                                      local.set 58
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    else
                                                                                                                                      i32.const 24
                                                                                                                                      local.set 58
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    end
                                                                                                                                  end
                                                                                                                                  f64.const 0x1.b851eb851eb85p-4 (;=0.1075;)
                                                                                                                                  f32.demote_f64
                                                                                                                                  local.set 18
                                                                                                                                  local.get 59
                                                                                                                                  global.set 0
                                                                                                                                  local.get 18
                                                                                                                                  return
                                                                                                                                end
                                                                                                                                i32.const 20
                                                                                                                                local.set 58
                                                                                                                                br 60 (;@2;)
                                                                                                                              end
                                                                                                                              i32.const 17
                                                                                                                              local.set 58
                                                                                                                              br 59 (;@2;)
                                                                                                                            end
                                                                                                                            i32.const 20
                                                                                                                            local.set 58
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                          local.get 1
                                                                                                                          i32.load
                                                                                                                          local.set 19
                                                                                                                          local.get 19
                                                                                                                          i32.const 5
                                                                                                                          i32.eq
                                                                                                                          local.set 20
                                                                                                                          local.get 20
                                                                                                                          if  ;; label = @60
                                                                                                                            i32.const 28
                                                                                                                            local.set 58
                                                                                                                            br 58 (;@2;)
                                                                                                                          else
                                                                                                                            i32.const 29
                                                                                                                            local.set 58
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                        end
                                                                                                                        f64.const 0x0p+0 (;=0;)
                                                                                                                        f64.const 0x1.65604189374bcp-3 (;=0.1745;)
                                                                                                                        f64.sub
                                                                                                                        local.set 21
                                                                                                                        local.get 21
                                                                                                                        f32.demote_f64
                                                                                                                        local.set 22
                                                                                                                        local.get 59
                                                                                                                        global.set 0
                                                                                                                        local.get 22
                                                                                                                        return
                                                                                                                      end
                                                                                                                      i32.const 25
                                                                                                                      local.set 58
                                                                                                                      br 55 (;@2;)
                                                                                                                    end
                                                                                                                    i32.const 22
                                                                                                                    local.set 58
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                  i32.const 25
                                                                                                                  local.set 58
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                local.get 1
                                                                                                                i32.load
                                                                                                                local.set 23
                                                                                                                local.get 23
                                                                                                                i32.const 6
                                                                                                                i32.eq
                                                                                                                local.set 24
                                                                                                                local.get 24
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 33
                                                                                                                  local.set 58
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 34
                                                                                                                  local.set 58
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              f64.const 0x1.ee3bcd35a8588p-1 (;=0.9653;)
                                                                                                              f32.demote_f64
                                                                                                              local.set 25
                                                                                                              local.get 59
                                                                                                              global.set 0
                                                                                                              local.get 25
                                                                                                              return
                                                                                                            end
                                                                                                            i32.const 30
                                                                                                            local.set 58
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 27
                                                                                                          local.set 58
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        i32.const 30
                                                                                                        local.set 58
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 1
                                                                                                      i32.load
                                                                                                      local.set 26
                                                                                                      local.get 26
                                                                                                      i32.const 7
                                                                                                      i32.eq
                                                                                                      local.set 27
                                                                                                      local.get 27
                                                                                                      if  ;; label = @50
                                                                                                        i32.const 38
                                                                                                        local.set 58
                                                                                                        br 48 (;@2;)
                                                                                                      else
                                                                                                        i32.const 39
                                                                                                        local.set 58
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                    end
                                                                                                    f64.const 0x0p+0 (;=0;)
                                                                                                    f64.const 0x1.36ae7d566cf42p-3 (;=0.1517;)
                                                                                                    f64.sub
                                                                                                    local.set 28
                                                                                                    local.get 28
                                                                                                    f32.demote_f64
                                                                                                    local.set 29
                                                                                                    local.get 59
                                                                                                    global.set 0
                                                                                                    local.get 29
                                                                                                    return
                                                                                                  end
                                                                                                  i32.const 35
                                                                                                  local.set 58
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                i32.const 32
                                                                                                local.set 58
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 35
                                                                                              local.set 58
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 1
                                                                                            i32.load
                                                                                            local.set 30
                                                                                            local.get 30
                                                                                            i32.const 8
                                                                                            i32.eq
                                                                                            local.set 31
                                                                                            local.get 31
                                                                                            if  ;; label = @45
                                                                                              i32.const 43
                                                                                              local.set 58
                                                                                              br 43 (;@2;)
                                                                                            else
                                                                                              i32.const 44
                                                                                              local.set 58
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                          end
                                                                                          f64.const 0x1.8d013a92a3055p+0 (;=1.5508;)
                                                                                          f32.demote_f64
                                                                                          local.set 32
                                                                                          local.get 59
                                                                                          global.set 0
                                                                                          local.get 32
                                                                                          return
                                                                                        end
                                                                                        i32.const 40
                                                                                        local.set 58
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      i32.const 37
                                                                                      local.set 58
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 40
                                                                                    local.set 58
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 1
                                                                                  i32.load
                                                                                  local.set 33
                                                                                  local.get 33
                                                                                  i32.const 9
                                                                                  i32.eq
                                                                                  local.set 34
                                                                                  local.get 34
                                                                                  if  ;; label = @40
                                                                                    i32.const 48
                                                                                    local.set 58
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 49
                                                                                    local.set 58
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                f64.const 0x1.a7525460aa64cp-2 (;=0.4134;)
                                                                                f32.demote_f64
                                                                                local.set 35
                                                                                local.get 59
                                                                                global.set 0
                                                                                local.get 35
                                                                                return
                                                                              end
                                                                              i32.const 45
                                                                              local.set 58
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 42
                                                                            local.set 58
                                                                            br 34 (;@2;)
                                                                          end
                                                                          i32.const 45
                                                                          local.set 58
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 1
                                                                        i32.load
                                                                        local.set 36
                                                                        local.get 36
                                                                        i32.const 10
                                                                        i32.eq
                                                                        local.set 37
                                                                        local.get 37
                                                                        if  ;; label = @35
                                                                          i32.const 53
                                                                          local.set 58
                                                                          br 33 (;@2;)
                                                                        else
                                                                          i32.const 54
                                                                          local.set 58
                                                                          br 33 (;@2;)
                                                                        end
                                                                      end
                                                                      f64.const 0x0p+0 (;=0;)
                                                                      f64.const 0x1.24dd2f1a9fbe7p-4 (;=0.0715;)
                                                                      f64.sub
                                                                      local.set 38
                                                                      local.get 38
                                                                      f32.demote_f64
                                                                      local.set 39
                                                                      local.get 59
                                                                      global.set 0
                                                                      local.get 39
                                                                      return
                                                                    end
                                                                    i32.const 50
                                                                    local.set 58
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 47
                                                                  local.set 58
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 50
                                                                local.set 58
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 1
                                                              i32.load
                                                              local.set 40
                                                              local.get 40
                                                              i32.const 11
                                                              i32.eq
                                                              local.set 41
                                                              local.get 41
                                                              if  ;; label = @30
                                                                i32.const 58
                                                                local.set 58
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 59
                                                                local.set 58
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            f64.const 0x1.1a786c226809dp-1 (;=0.5517;)
                                                            f32.demote_f64
                                                            local.set 42
                                                            local.get 59
                                                            global.set 0
                                                            local.get 42
                                                            return
                                                          end
                                                          i32.const 55
                                                          local.set 58
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 52
                                                        local.set 58
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 55
                                                      local.set 58
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 1
                                                    i32.load
                                                    local.set 43
                                                    local.get 43
                                                    i32.const 12
                                                    i32.eq
                                                    local.set 44
                                                    local.get 44
                                                    if  ;; label = @25
                                                      i32.const 63
                                                      local.set 58
                                                      br 23 (;@2;)
                                                    else
                                                      i32.const 64
                                                      local.set 58
                                                      br 23 (;@2;)
                                                    end
                                                  end
                                                  f64.const 0x0p+0 (;=0;)
                                                  f64.const 0x1.73eab367a0f91p-2 (;=0.3632;)
                                                  f64.sub
                                                  local.set 45
                                                  local.get 45
                                                  f32.demote_f64
                                                  local.set 46
                                                  local.get 59
                                                  global.set 0
                                                  local.get 46
                                                  return
                                                end
                                                i32.const 60
                                                local.set 58
                                                br 20 (;@2;)
                                              end
                                              i32.const 57
                                              local.set 58
                                              br 19 (;@2;)
                                            end
                                            i32.const 60
                                            local.set 58
                                            br 18 (;@2;)
                                          end
                                          local.get 1
                                          i32.load
                                          local.set 47
                                          local.get 47
                                          i32.const 13
                                          i32.eq
                                          local.set 48
                                          local.get 48
                                          if  ;; label = @20
                                            i32.const 68
                                            local.set 58
                                            br 18 (;@2;)
                                          else
                                            i32.const 69
                                            local.set 58
                                            br 18 (;@2;)
                                          end
                                        end
                                        f64.const 0x0p+0 (;=0;)
                                        f64.const 0x1.89a027525460bp-3 (;=0.1922;)
                                        f64.sub
                                        local.set 49
                                        local.get 49
                                        f32.demote_f64
                                        local.set 50
                                        local.get 59
                                        global.set 0
                                        local.get 50
                                        return
                                      end
                                      i32.const 65
                                      local.set 58
                                      br 15 (;@2;)
                                    end
                                    i32.const 62
                                    local.set 58
                                    br 14 (;@2;)
                                  end
                                  i32.const 65
                                  local.set 58
                                  br 13 (;@2;)
                                end
                                local.get 1
                                i32.load
                                local.set 51
                                local.get 51
                                i32.const 14
                                i32.eq
                                local.set 52
                                local.get 52
                                if  ;; label = @15
                                  i32.const 73
                                  local.set 58
                                  br 13 (;@2;)
                                else
                                  i32.const 74
                                  local.set 58
                                  br 13 (;@2;)
                                end
                              end
                              f64.const 0x0p+0 (;=0;)
                              f64.const 0x1.e63f141205bcp-1 (;=0.9497;)
                              f64.sub
                              local.set 53
                              local.get 53
                              f32.demote_f64
                              local.set 54
                              local.get 59
                              global.set 0
                              local.get 54
                              return
                            end
                            i32.const 70
                            local.set 58
                            br 10 (;@2;)
                          end
                          i32.const 67
                          local.set 58
                          br 9 (;@2;)
                        end
                        i32.const 70
                        local.set 58
                        br 8 (;@2;)
                      end
                      f64.const 0x0p+0 (;=0;)
                      f64.const 0x1.2b1c432ca57a8p-2 (;=0.2921;)
                      f64.sub
                      local.set 55
                      local.get 55
                      f32.demote_f64
                      local.set 56
                      local.get 59
                      global.set 0
                      local.get 56
                      return
                    end
                    f64.const 0x1.004ea4a8c154dp-2 (;=0.2503;)
                    f32.demote_f64
                    local.set 57
                    local.get 59
                    global.set 0
                    local.get 57
                    return
                  end
                  i32.const 75
                  local.set 58
                  br 5 (;@2;)
                end
                i32.const 72
                local.set 58
                br 4 (;@2;)
              end
              i32.const 75
              local.set 58
              br 3 (;@2;)
            end
            i32.const 79
            local.set 58
            br 2 (;@2;)
          end
          i32.const 77
          local.set 58
          br 1 (;@2;)
        end
        i32.const 1
        local.set 58
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;2;) (type 1) (param i32) (result f32)
    (local i32 i32 i32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 i32 i32 f32 f32 f32 i32 i32)
    global.get 0
    local.set 49
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            block  ;; label = @61
                                                                                                                              block  ;; label = @62
                                                                                                                                block  ;; label = @63
                                                                                                                                  block  ;; label = @64
                                                                                                                                    block  ;; label = @65
                                                                                                                                      block  ;; label = @66
                                                                                                                                        block  ;; label = @67
                                                                                                                                          block  ;; label = @68
                                                                                                                                            block  ;; label = @69
                                                                                                                                              block  ;; label = @70
                                                                                                                                                block  ;; label = @71
                                                                                                                                                  block  ;; label = @72
                                                                                                                                                    block  ;; label = @73
                                                                                                                                                      block  ;; label = @74
                                                                                                                                                        block  ;; label = @75
                                                                                                                                                          block  ;; label = @76
                                                                                                                                                            block  ;; label = @77
                                                                                                                                                              block  ;; label = @78
                                                                                                                                                                block  ;; label = @79
                                                                                                                                                                  block  ;; label = @80
                                                                                                                                                                    block  ;; label = @81
                                                                                                                                                                      block  ;; label = @82
                                                                                                                                                                        local.get 48
                                                                                                                                                                        br_table 0 (;@82;) 1 (;@81;) 2 (;@80;) 3 (;@79;) 4 (;@78;) 5 (;@77;) 6 (;@76;) 7 (;@75;) 8 (;@74;) 9 (;@73;) 10 (;@72;) 11 (;@71;) 12 (;@70;) 13 (;@69;) 14 (;@68;) 15 (;@67;) 16 (;@66;) 17 (;@65;) 18 (;@64;) 19 (;@63;) 20 (;@62;) 21 (;@61;) 22 (;@60;) 23 (;@59;) 24 (;@58;) 25 (;@57;) 26 (;@56;) 27 (;@55;) 28 (;@54;) 29 (;@53;) 30 (;@52;) 31 (;@51;) 32 (;@50;) 33 (;@49;) 34 (;@48;) 35 (;@47;) 36 (;@46;) 37 (;@45;) 38 (;@44;) 39 (;@43;) 40 (;@42;) 41 (;@41;) 42 (;@40;) 43 (;@39;) 44 (;@38;) 45 (;@37;) 46 (;@36;) 47 (;@35;) 48 (;@34;) 49 (;@33;) 50 (;@32;) 51 (;@31;) 52 (;@30;) 53 (;@29;) 54 (;@28;) 55 (;@27;) 56 (;@26;) 57 (;@25;) 58 (;@24;) 59 (;@23;) 60 (;@22;) 61 (;@21;) 62 (;@20;) 63 (;@19;) 64 (;@18;) 65 (;@17;) 66 (;@16;) 67 (;@15;) 68 (;@14;) 69 (;@13;) 70 (;@12;) 71 (;@11;) 72 (;@10;) 73 (;@9;) 74 (;@8;) 75 (;@7;) 76 (;@6;) 77 (;@5;) 78 (;@4;) 79 (;@3;) 81 (;@1;)
                                                                                                                                                                      end
                                                                                                                                                                      global.get 0
                                                                                                                                                                      local.set 1
                                                                                                                                                                      global.get 0
                                                                                                                                                                      i32.const 4
                                                                                                                                                                      i32.add
                                                                                                                                                                      global.set 0
                                                                                                                                                                      local.get 1
                                                                                                                                                                      local.get 0
                                                                                                                                                                      i32.store
                                                                                                                                                                      local.get 1
                                                                                                                                                                      i32.load
                                                                                                                                                                      local.set 2
                                                                                                                                                                      local.get 2
                                                                                                                                                                      i32.const 0
                                                                                                                                                                      i32.eq
                                                                                                                                                                      local.set 3
                                                                                                                                                                      local.get 3
                                                                                                                                                                      if  ;; label = @82
                                                                                                                                                                        i32.const 3
                                                                                                                                                                        local.set 48
                                                                                                                                                                        br 80 (;@2;)
                                                                                                                                                                      else
                                                                                                                                                                        i32.const 4
                                                                                                                                                                        local.set 48
                                                                                                                                                                        br 80 (;@2;)
                                                                                                                                                                      end
                                                                                                                                                                    end
                                                                                                                                                                    local.get 49
                                                                                                                                                                    global.set 0
                                                                                                                                                                    f32.const 0x0p+0 (;=0;)
                                                                                                                                                                    return
                                                                                                                                                                  end
                                                                                                                                                                  local.get 1
                                                                                                                                                                  i32.load
                                                                                                                                                                  local.set 4
                                                                                                                                                                  local.get 4
                                                                                                                                                                  i32.const 1
                                                                                                                                                                  i32.eq
                                                                                                                                                                  local.set 5
                                                                                                                                                                  local.get 5
                                                                                                                                                                  if  ;; label = @80
                                                                                                                                                                    i32.const 8
                                                                                                                                                                    local.set 48
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  else
                                                                                                                                                                    i32.const 9
                                                                                                                                                                    local.set 48
                                                                                                                                                                    br 78 (;@2;)
                                                                                                                                                                  end
                                                                                                                                                                end
                                                                                                                                                                f64.const 0x1.68c154c985f07p+1 (;=2.8184;)
                                                                                                                                                                f32.demote_f64
                                                                                                                                                                local.set 6
                                                                                                                                                                local.get 49
                                                                                                                                                                global.set 0
                                                                                                                                                                local.get 6
                                                                                                                                                                return
                                                                                                                                                              end
                                                                                                                                                              i32.const 5
                                                                                                                                                              local.set 48
                                                                                                                                                              br 75 (;@2;)
                                                                                                                                                            end
                                                                                                                                                            i32.const 2
                                                                                                                                                            local.set 48
                                                                                                                                                            br 74 (;@2;)
                                                                                                                                                          end
                                                                                                                                                          i32.const 5
                                                                                                                                                          local.set 48
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        end
                                                                                                                                                        local.get 1
                                                                                                                                                        i32.load
                                                                                                                                                        local.set 7
                                                                                                                                                        local.get 7
                                                                                                                                                        i32.const 2
                                                                                                                                                        i32.eq
                                                                                                                                                        local.set 8
                                                                                                                                                        local.get 8
                                                                                                                                                        if  ;; label = @75
                                                                                                                                                          i32.const 13
                                                                                                                                                          local.set 48
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        else
                                                                                                                                                          i32.const 14
                                                                                                                                                          local.set 48
                                                                                                                                                          br 73 (;@2;)
                                                                                                                                                        end
                                                                                                                                                      end
                                                                                                                                                      f64.const 0x1.743fe5c91d14ep+0 (;=1.4541;)
                                                                                                                                                      f32.demote_f64
                                                                                                                                                      local.set 9
                                                                                                                                                      local.get 49
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 9
                                                                                                                                                      return
                                                                                                                                                    end
                                                                                                                                                    i32.const 10
                                                                                                                                                    local.set 48
                                                                                                                                                    br 70 (;@2;)
                                                                                                                                                  end
                                                                                                                                                  i32.const 7
                                                                                                                                                  local.set 48
                                                                                                                                                  br 69 (;@2;)
                                                                                                                                                end
                                                                                                                                                i32.const 10
                                                                                                                                                local.set 48
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                              local.get 1
                                                                                                                                              i32.load
                                                                                                                                              local.set 10
                                                                                                                                              local.get 10
                                                                                                                                              i32.const 3
                                                                                                                                              i32.eq
                                                                                                                                              local.set 11
                                                                                                                                              local.get 11
                                                                                                                                              if  ;; label = @70
                                                                                                                                                i32.const 18
                                                                                                                                                local.set 48
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              else
                                                                                                                                                i32.const 19
                                                                                                                                                local.set 48
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                            end
                                                                                                                                            f64.const 0x1.29eb851eb851fp+1 (;=2.3275;)
                                                                                                                                            f32.demote_f64
                                                                                                                                            local.set 12
                                                                                                                                            local.get 49
                                                                                                                                            global.set 0
                                                                                                                                            local.get 12
                                                                                                                                            return
                                                                                                                                          end
                                                                                                                                          i32.const 15
                                                                                                                                          local.set 48
                                                                                                                                          br 65 (;@2;)
                                                                                                                                        end
                                                                                                                                        i32.const 12
                                                                                                                                        local.set 48
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                      i32.const 15
                                                                                                                                      local.set 48
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    end
                                                                                                                                    local.get 1
                                                                                                                                    i32.load
                                                                                                                                    local.set 13
                                                                                                                                    local.get 13
                                                                                                                                    i32.const 4
                                                                                                                                    i32.eq
                                                                                                                                    local.set 14
                                                                                                                                    local.get 14
                                                                                                                                    if  ;; label = @65
                                                                                                                                      i32.const 23
                                                                                                                                      local.set 48
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    else
                                                                                                                                      i32.const 24
                                                                                                                                      local.set 48
                                                                                                                                      br 63 (;@2;)
                                                                                                                                    end
                                                                                                                                  end
                                                                                                                                  f64.const 0x1.53f141205bc02p+1 (;=2.6558;)
                                                                                                                                  f32.demote_f64
                                                                                                                                  local.set 15
                                                                                                                                  local.get 49
                                                                                                                                  global.set 0
                                                                                                                                  local.get 15
                                                                                                                                  return
                                                                                                                                end
                                                                                                                                i32.const 20
                                                                                                                                local.set 48
                                                                                                                                br 60 (;@2;)
                                                                                                                              end
                                                                                                                              i32.const 17
                                                                                                                              local.set 48
                                                                                                                              br 59 (;@2;)
                                                                                                                            end
                                                                                                                            i32.const 20
                                                                                                                            local.set 48
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                          local.get 1
                                                                                                                          i32.load
                                                                                                                          local.set 16
                                                                                                                          local.get 16
                                                                                                                          i32.const 5
                                                                                                                          i32.eq
                                                                                                                          local.set 17
                                                                                                                          local.get 17
                                                                                                                          if  ;; label = @60
                                                                                                                            i32.const 28
                                                                                                                            local.set 48
                                                                                                                            br 58 (;@2;)
                                                                                                                          else
                                                                                                                            i32.const 29
                                                                                                                            local.set 48
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                        end
                                                                                                                        f64.const 0x1.3837b4a2339c1p+0 (;=1.2196;)
                                                                                                                        f32.demote_f64
                                                                                                                        local.set 18
                                                                                                                        local.get 49
                                                                                                                        global.set 0
                                                                                                                        local.get 18
                                                                                                                        return
                                                                                                                      end
                                                                                                                      i32.const 25
                                                                                                                      local.set 48
                                                                                                                      br 55 (;@2;)
                                                                                                                    end
                                                                                                                    i32.const 22
                                                                                                                    local.set 48
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                  i32.const 25
                                                                                                                  local.set 48
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                local.get 1
                                                                                                                i32.load
                                                                                                                local.set 19
                                                                                                                local.get 19
                                                                                                                i32.const 6
                                                                                                                i32.eq
                                                                                                                local.set 20
                                                                                                                local.get 20
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 33
                                                                                                                  local.set 48
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 34
                                                                                                                  local.set 48
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              f64.const 0x1.c5532617c1bdap+0 (;=1.7708;)
                                                                                                              f32.demote_f64
                                                                                                              local.set 21
                                                                                                              local.get 49
                                                                                                              global.set 0
                                                                                                              local.get 21
                                                                                                              return
                                                                                                            end
                                                                                                            i32.const 30
                                                                                                            local.set 48
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 27
                                                                                                          local.set 48
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        i32.const 30
                                                                                                        local.set 48
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 1
                                                                                                      i32.load
                                                                                                      local.set 22
                                                                                                      local.get 22
                                                                                                      i32.const 7
                                                                                                      i32.eq
                                                                                                      local.set 23
                                                                                                      local.get 23
                                                                                                      if  ;; label = @50
                                                                                                        i32.const 38
                                                                                                        local.set 48
                                                                                                        br 48 (;@2;)
                                                                                                      else
                                                                                                        i32.const 39
                                                                                                        local.set 48
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                    end
                                                                                                    f64.const 0x1.4d77318fc5048p+1 (;=2.6052;)
                                                                                                    f32.demote_f64
                                                                                                    local.set 24
                                                                                                    local.get 49
                                                                                                    global.set 0
                                                                                                    local.get 24
                                                                                                    return
                                                                                                  end
                                                                                                  i32.const 35
                                                                                                  local.set 48
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                i32.const 32
                                                                                                local.set 48
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 35
                                                                                              local.set 48
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 1
                                                                                            i32.load
                                                                                            local.set 25
                                                                                            local.get 25
                                                                                            i32.const 8
                                                                                            i32.eq
                                                                                            local.set 26
                                                                                            local.get 26
                                                                                            if  ;; label = @45
                                                                                              i32.const 43
                                                                                              local.set 48
                                                                                              br 43 (;@2;)
                                                                                            else
                                                                                              i32.const 44
                                                                                              local.set 48
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                          end
                                                                                          f64.const 0x1.0982a9930be0ep+1 (;=2.0743;)
                                                                                          f32.demote_f64
                                                                                          local.set 27
                                                                                          local.get 49
                                                                                          global.set 0
                                                                                          local.get 27
                                                                                          return
                                                                                        end
                                                                                        i32.const 40
                                                                                        local.set 48
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      i32.const 37
                                                                                      local.set 48
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 40
                                                                                    local.set 48
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 1
                                                                                  i32.load
                                                                                  local.set 28
                                                                                  local.get 28
                                                                                  i32.const 9
                                                                                  i32.eq
                                                                                  local.set 29
                                                                                  local.get 29
                                                                                  if  ;; label = @40
                                                                                    i32.const 48
                                                                                    local.set 48
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 49
                                                                                    local.set 48
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                f64.const 0x1.a264c2f837b4ap+1 (;=3.2687;)
                                                                                f32.demote_f64
                                                                                local.set 30
                                                                                local.get 49
                                                                                global.set 0
                                                                                local.get 30
                                                                                return
                                                                              end
                                                                              i32.const 45
                                                                              local.set 48
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 42
                                                                            local.set 48
                                                                            br 34 (;@2;)
                                                                          end
                                                                          i32.const 45
                                                                          local.set 48
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 1
                                                                        i32.load
                                                                        local.set 31
                                                                        local.get 31
                                                                        i32.const 10
                                                                        i32.eq
                                                                        local.set 32
                                                                        local.get 32
                                                                        if  ;; label = @35
                                                                          i32.const 53
                                                                          local.set 48
                                                                          br 33 (;@2;)
                                                                        else
                                                                          i32.const 54
                                                                          local.set 48
                                                                          br 33 (;@2;)
                                                                        end
                                                                      end
                                                                      f64.const 0x1.13886594af4f1p+1 (;=2.1526;)
                                                                      f32.demote_f64
                                                                      local.set 33
                                                                      local.get 49
                                                                      global.set 0
                                                                      local.get 33
                                                                      return
                                                                    end
                                                                    i32.const 50
                                                                    local.set 48
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 47
                                                                  local.set 48
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 50
                                                                local.set 48
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 1
                                                              i32.load
                                                              local.set 34
                                                              local.get 34
                                                              i32.const 11
                                                              i32.eq
                                                              local.set 35
                                                              local.get 35
                                                              if  ;; label = @30
                                                                i32.const 58
                                                                local.set 48
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 59
                                                                local.set 48
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            f64.const 0x1.6ebedfa43fe5dp+1 (;=2.8652;)
                                                            f32.demote_f64
                                                            local.set 36
                                                            local.get 49
                                                            global.set 0
                                                            local.get 36
                                                            return
                                                          end
                                                          i32.const 55
                                                          local.set 48
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 52
                                                        local.set 48
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 55
                                                      local.set 48
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 1
                                                    i32.load
                                                    local.set 37
                                                    local.get 37
                                                    i32.const 12
                                                    i32.eq
                                                    local.set 38
                                                    local.get 38
                                                    if  ;; label = @25
                                                      i32.const 63
                                                      local.set 48
                                                      br 23 (;@2;)
                                                    else
                                                      i32.const 64
                                                      local.set 48
                                                      br 23 (;@2;)
                                                    end
                                                  end
                                                  f64.const 0x1.8ed288ce703bp+0 (;=1.5579;)
                                                  f32.demote_f64
                                                  local.set 39
                                                  local.get 49
                                                  global.set 0
                                                  local.get 39
                                                  return
                                                end
                                                i32.const 60
                                                local.set 48
                                                br 20 (;@2;)
                                              end
                                              i32.const 57
                                              local.set 48
                                              br 19 (;@2;)
                                            end
                                            i32.const 60
                                            local.set 48
                                            br 18 (;@2;)
                                          end
                                          local.get 1
                                          i32.load
                                          local.set 40
                                          local.get 40
                                          i32.const 13
                                          i32.eq
                                          local.set 41
                                          local.get 41
                                          if  ;; label = @20
                                            i32.const 68
                                            local.set 48
                                            br 18 (;@2;)
                                          else
                                            i32.const 69
                                            local.set 48
                                            br 18 (;@2;)
                                          end
                                        end
                                        f64.const 0x1.a36113404ea4bp+0 (;=1.6382;)
                                        f32.demote_f64
                                        local.set 42
                                        local.get 49
                                        global.set 0
                                        local.get 42
                                        return
                                      end
                                      i32.const 65
                                      local.set 48
                                      br 15 (;@2;)
                                    end
                                    i32.const 62
                                    local.set 48
                                    br 14 (;@2;)
                                  end
                                  i32.const 65
                                  local.set 48
                                  br 13 (;@2;)
                                end
                                local.get 1
                                i32.load
                                local.set 43
                                local.get 43
                                i32.const 14
                                i32.eq
                                local.set 44
                                local.get 44
                                if  ;; label = @15
                                  i32.const 73
                                  local.set 48
                                  br 13 (;@2;)
                                else
                                  i32.const 74
                                  local.set 48
                                  br 13 (;@2;)
                                end
                              end
                              f64.const 0x1.2013a92a30553p+0 (;=1.1253;)
                              f32.demote_f64
                              local.set 45
                              local.get 49
                              global.set 0
                              local.get 45
                              return
                            end
                            i32.const 70
                            local.set 48
                            br 10 (;@2;)
                          end
                          i32.const 67
                          local.set 48
                          br 9 (;@2;)
                        end
                        i32.const 70
                        local.set 48
                        br 8 (;@2;)
                      end
                      f64.const 0x1.ea7ef9db22d0ep+0 (;=1.916;)
                      f32.demote_f64
                      local.set 46
                      local.get 49
                      global.set 0
                      local.get 46
                      return
                    end
                    f64.const 0x1.699ce075f6fd2p+1 (;=2.8251;)
                    f32.demote_f64
                    local.set 47
                    local.get 49
                    global.set 0
                    local.get 47
                    return
                  end
                  i32.const 75
                  local.set 48
                  br 5 (;@2;)
                end
                i32.const 72
                local.set 48
                br 4 (;@2;)
              end
              i32.const 75
              local.set 48
              br 3 (;@2;)
            end
            i32.const 79
            local.set 48
            br 2 (;@2;)
          end
          i32.const 77
          local.set 48
          br 1 (;@2;)
        end
        i32.const 1
        local.set 48
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;3;) (type 2) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 f32 f32 f32 f32 f32 i32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 68
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      local.get 67
                                                                                                      br_table 0 (;@49;) 1 (;@48;) 2 (;@47;) 3 (;@46;) 4 (;@45;) 5 (;@44;) 6 (;@43;) 7 (;@42;) 8 (;@41;) 9 (;@40;) 10 (;@39;) 11 (;@38;) 12 (;@37;) 13 (;@36;) 14 (;@35;) 15 (;@34;) 16 (;@33;) 17 (;@32;) 18 (;@31;) 19 (;@30;) 20 (;@29;) 21 (;@28;) 22 (;@27;) 23 (;@26;) 24 (;@25;) 25 (;@24;) 26 (;@23;) 27 (;@22;) 28 (;@21;) 29 (;@20;) 30 (;@19;) 31 (;@18;) 32 (;@17;) 33 (;@16;) 34 (;@15;) 35 (;@14;) 36 (;@13;) 37 (;@12;) 38 (;@11;) 39 (;@10;) 40 (;@9;) 41 (;@8;) 42 (;@7;) 43 (;@6;) 44 (;@5;) 45 (;@4;) 46 (;@3;) 48 (;@1;)
                                                                                                    end
                                                                                                    global.get 0
                                                                                                    local.set 4
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 4
                                                                                                    local.get 0
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 5
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 5
                                                                                                    local.get 1
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 6
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 6
                                                                                                    local.get 2
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 7
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 7
                                                                                                    local.get 3
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 8
                                                                                                    global.get 0
                                                                                                    i32.const 1
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 8
                                                                                                    i32.const 1
                                                                                                    i32.store8
                                                                                                    local.get 5
                                                                                                    i32.load
                                                                                                    local.set 9
                                                                                                    local.get 9
                                                                                                    i32.const 128
                                                                                                    i32.ne
                                                                                                    local.set 10
                                                                                                    local.get 10
                                                                                                    if  ;; label = @49
                                                                                                      i32.const 3
                                                                                                      local.set 67
                                                                                                      br 47 (;@2;)
                                                                                                    else
                                                                                                      i32.const 4
                                                                                                      local.set 67
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                  end
                                                                                                  local.get 68
                                                                                                  global.set 0
                                                                                                  i32.const 0
                                                                                                  return
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 11
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 11
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                global.get 0
                                                                                                local.set 12
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 12
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 13
                                                                                                global.get 0
                                                                                                local.set 14
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 14
                                                                                                local.get 13
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 15
                                                                                                global.get 0
                                                                                                local.set 16
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 16
                                                                                                local.get 15
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 17
                                                                                                global.get 0
                                                                                                local.set 18
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 18
                                                                                                local.get 17
                                                                                                f32.store
                                                                                                i32.const 12
                                                                                                local.set 67
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 5
                                                                                              local.set 67
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 7
                                                                                            i32.load
                                                                                            local.set 19
                                                                                            local.get 5
                                                                                            i32.load
                                                                                            local.set 20
                                                                                            local.get 19
                                                                                            local.get 20
                                                                                            i32.lt_s
                                                                                            local.set 21
                                                                                            local.get 8
                                                                                            local.get 21
                                                                                            i32.store8
                                                                                            i32.const 5
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 8
                                                                                          i32.load8_u
                                                                                          local.set 22
                                                                                          local.get 22
                                                                                          if  ;; label = @44
                                                                                            i32.const 6
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 7
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 0
                                                                                        i32.const 1
                                                                                        i32.sub
                                                                                        local.set 23
                                                                                        local.get 68
                                                                                        global.set 0
                                                                                        local.get 23
                                                                                        return
                                                                                      end
                                                                                      i32.const 8
                                                                                      local.set 67
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 2
                                                                                    local.set 67
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  i32.const 8
                                                                                  local.set 67
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 11
                                                                                i32.const 0
                                                                                i32.store
                                                                                i32.const 29
                                                                                local.set 67
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 10
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            end
                                                                            local.get 11
                                                                            i32.load
                                                                            local.set 24
                                                                            local.get 5
                                                                            i32.load
                                                                            local.set 25
                                                                            local.get 24
                                                                            local.get 25
                                                                            i32.lt_s
                                                                            local.set 26
                                                                            local.get 26
                                                                            if  ;; label = @37
                                                                              i32.const 16
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 17
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          i32.const 11
                                                                          local.set 67
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 12
                                                                        local.set 67
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 14
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 4
                                                                    i32.load
                                                                    local.set 27
                                                                    local.get 11
                                                                    i32.load
                                                                    local.set 28
                                                                    local.get 27
                                                                    local.get 28
                                                                    i32.const 4
                                                                    i32.mul
                                                                    i32.add
                                                                    local.set 29
                                                                    local.get 29
                                                                    f32.load
                                                                    local.set 30
                                                                    local.get 30
                                                                    call 0
                                                                    local.set 31
                                                                    local.get 31
                                                                    i32.eqz
                                                                    local.set 32
                                                                    local.get 32
                                                                    if  ;; label = @33
                                                                      i32.const 20
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    else
                                                                      i32.const 21
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    end
                                                                  end
                                                                  i32.const 11
                                                                  local.set 67
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 15
                                                                local.set 67
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 11
                                                              i32.load
                                                              local.set 33
                                                              local.get 33
                                                              i32.const 1
                                                              i32.add
                                                              local.set 34
                                                              local.get 11
                                                              local.get 34
                                                              i32.store
                                                              i32.const 24
                                                              local.set 67
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 35
                                                            local.get 68
                                                            global.set 0
                                                            local.get 35
                                                            return
                                                          end
                                                          i32.const 22
                                                          local.set 67
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 19
                                                        local.set 67
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 22
                                                      local.set 67
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 18
                                                    local.set 67
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 18
                                                  local.set 67
                                                  br 21 (;@2;)
                                                end
                                                i32.const 12
                                                local.set 67
                                                br 20 (;@2;)
                                              end
                                              local.get 68
                                              global.set 0
                                              i32.const 0
                                              return
                                            end
                                            i32.const 27
                                            local.set 67
                                            br 18 (;@2;)
                                          end
                                          local.get 11
                                          i32.load
                                          local.set 36
                                          local.get 5
                                          i32.load
                                          local.set 37
                                          local.get 36
                                          local.get 37
                                          i32.lt_s
                                          local.set 38
                                          local.get 38
                                          if  ;; label = @20
                                            i32.const 33
                                            local.set 67
                                            br 18 (;@2;)
                                          else
                                            i32.const 34
                                            local.set 67
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 28
                                        local.set 67
                                        br 16 (;@2;)
                                      end
                                      i32.const 29
                                      local.set 67
                                      br 15 (;@2;)
                                    end
                                    i32.const 31
                                    local.set 67
                                    br 14 (;@2;)
                                  end
                                  local.get 11
                                  i32.load
                                  local.set 39
                                  local.get 39
                                  i32.const 8
                                  i32.div_s
                                  local.set 40
                                  local.get 12
                                  local.get 40
                                  i32.store
                                  local.get 4
                                  i32.load
                                  local.set 41
                                  local.get 11
                                  i32.load
                                  local.set 42
                                  local.get 41
                                  local.get 42
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 43
                                  local.get 43
                                  f32.load
                                  local.set 44
                                  local.get 12
                                  i32.load
                                  local.set 45
                                  local.get 45
                                  call 1
                                  local.set 46
                                  local.get 44
                                  local.get 46
                                  f32.sub
                                  local.set 47
                                  local.get 14
                                  local.get 47
                                  f32.store
                                  local.get 14
                                  f32.load
                                  local.set 48
                                  i32.const 1
                                  f32.convert_i32_s
                                  local.set 49
                                  local.get 48
                                  local.get 49
                                  f32.mul
                                  local.set 50
                                  local.get 16
                                  local.get 50
                                  f32.store
                                  local.get 16
                                  f32.load
                                  local.set 51
                                  local.get 12
                                  i32.load
                                  local.set 52
                                  local.get 52
                                  call 2
                                  local.set 53
                                  local.get 51
                                  local.get 53
                                  f32.div
                                  local.set 54
                                  local.get 18
                                  local.get 54
                                  f32.store
                                  local.get 18
                                  f32.load
                                  local.set 55
                                  local.get 55
                                  call 0
                                  local.set 56
                                  local.get 56
                                  i32.eqz
                                  local.set 57
                                  local.get 57
                                  if  ;; label = @16
                                    i32.const 37
                                    local.set 67
                                    br 14 (;@2;)
                                  else
                                    i32.const 38
                                    local.set 67
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 28
                                local.set 67
                                br 12 (;@2;)
                              end
                              i32.const 32
                              local.set 67
                              br 11 (;@2;)
                            end
                            local.get 18
                            f32.load
                            local.set 58
                            local.get 6
                            i32.load
                            local.set 59
                            local.get 6
                            i32.load
                            local.set 60
                            local.get 11
                            i32.load
                            local.set 61
                            local.get 6
                            i32.load
                            local.set 62
                            local.get 62
                            local.get 61
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 63
                            local.get 63
                            local.get 58
                            f32.store
                            local.get 11
                            i32.load
                            local.set 64
                            local.get 64
                            i32.const 1
                            i32.add
                            local.set 65
                            local.get 11
                            local.get 65
                            i32.store
                            i32.const 41
                            local.set 67
                            br 10 (;@2;)
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 66
                          local.get 68
                          global.set 0
                          local.get 66
                          return
                        end
                        i32.const 39
                        local.set 67
                        br 8 (;@2;)
                      end
                      i32.const 36
                      local.set 67
                      br 7 (;@2;)
                    end
                    i32.const 39
                    local.set 67
                    br 6 (;@2;)
                  end
                  i32.const 35
                  local.set 67
                  br 5 (;@2;)
                end
                i32.const 35
                local.set 67
                br 4 (;@2;)
              end
              i32.const 29
              local.set 67
              br 3 (;@2;)
            end
            i32.const 46
            local.set 67
            br 2 (;@2;)
          end
          i32.const 44
          local.set 67
          br 1 (;@2;)
        end
        i32.const 1
        local.set 67
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;4;) (type 2) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 6
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 5
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                call 3
                local.set 4
                local.get 6
                global.set 0
                local.get 4
                return
              end
              local.get 6
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 5
            br 2 (;@2;)
          end
          i32.const 2
          local.set 5
          br 1 (;@2;)
        end
        i32.const 1
        local.set 5
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 2) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 f32 f32 f32 f32 f32 i32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 68
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      local.get 67
                                                                                                      br_table 0 (;@49;) 1 (;@48;) 2 (;@47;) 3 (;@46;) 4 (;@45;) 5 (;@44;) 6 (;@43;) 7 (;@42;) 8 (;@41;) 9 (;@40;) 10 (;@39;) 11 (;@38;) 12 (;@37;) 13 (;@36;) 14 (;@35;) 15 (;@34;) 16 (;@33;) 17 (;@32;) 18 (;@31;) 19 (;@30;) 20 (;@29;) 21 (;@28;) 22 (;@27;) 23 (;@26;) 24 (;@25;) 25 (;@24;) 26 (;@23;) 27 (;@22;) 28 (;@21;) 29 (;@20;) 30 (;@19;) 31 (;@18;) 32 (;@17;) 33 (;@16;) 34 (;@15;) 35 (;@14;) 36 (;@13;) 37 (;@12;) 38 (;@11;) 39 (;@10;) 40 (;@9;) 41 (;@8;) 42 (;@7;) 43 (;@6;) 44 (;@5;) 45 (;@4;) 46 (;@3;) 48 (;@1;)
                                                                                                    end
                                                                                                    global.get 0
                                                                                                    local.set 4
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 4
                                                                                                    local.get 0
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 5
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 5
                                                                                                    local.get 1
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 6
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 6
                                                                                                    local.get 2
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 7
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 7
                                                                                                    local.get 3
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 8
                                                                                                    global.get 0
                                                                                                    i32.const 1
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 8
                                                                                                    i32.const 1
                                                                                                    i32.store8
                                                                                                    local.get 5
                                                                                                    i32.load
                                                                                                    local.set 9
                                                                                                    local.get 9
                                                                                                    i32.const 128
                                                                                                    i32.ne
                                                                                                    local.set 10
                                                                                                    local.get 10
                                                                                                    if  ;; label = @49
                                                                                                      i32.const 3
                                                                                                      local.set 67
                                                                                                      br 47 (;@2;)
                                                                                                    else
                                                                                                      i32.const 4
                                                                                                      local.set 67
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                  end
                                                                                                  local.get 68
                                                                                                  global.set 0
                                                                                                  i32.const 0
                                                                                                  return
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 11
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 11
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                global.get 0
                                                                                                local.set 12
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 12
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 13
                                                                                                global.get 0
                                                                                                local.set 14
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 14
                                                                                                local.get 13
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 15
                                                                                                global.get 0
                                                                                                local.set 16
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 16
                                                                                                local.get 15
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 17
                                                                                                global.get 0
                                                                                                local.set 18
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 18
                                                                                                local.get 17
                                                                                                f32.store
                                                                                                i32.const 12
                                                                                                local.set 67
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 5
                                                                                              local.set 67
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 7
                                                                                            i32.load
                                                                                            local.set 19
                                                                                            local.get 5
                                                                                            i32.load
                                                                                            local.set 20
                                                                                            local.get 19
                                                                                            local.get 20
                                                                                            i32.lt_s
                                                                                            local.set 21
                                                                                            local.get 8
                                                                                            local.get 21
                                                                                            i32.store8
                                                                                            i32.const 5
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 8
                                                                                          i32.load8_u
                                                                                          local.set 22
                                                                                          local.get 22
                                                                                          if  ;; label = @44
                                                                                            i32.const 6
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 7
                                                                                            local.set 67
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 0
                                                                                        i32.const 1
                                                                                        i32.sub
                                                                                        local.set 23
                                                                                        local.get 68
                                                                                        global.set 0
                                                                                        local.get 23
                                                                                        return
                                                                                      end
                                                                                      i32.const 8
                                                                                      local.set 67
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 2
                                                                                    local.set 67
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  i32.const 8
                                                                                  local.set 67
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 11
                                                                                i32.const 0
                                                                                i32.store
                                                                                i32.const 29
                                                                                local.set 67
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 10
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            end
                                                                            local.get 11
                                                                            i32.load
                                                                            local.set 24
                                                                            local.get 5
                                                                            i32.load
                                                                            local.set 25
                                                                            local.get 24
                                                                            local.get 25
                                                                            i32.lt_s
                                                                            local.set 26
                                                                            local.get 26
                                                                            if  ;; label = @37
                                                                              i32.const 16
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 17
                                                                              local.set 67
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          i32.const 11
                                                                          local.set 67
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 12
                                                                        local.set 67
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 14
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 4
                                                                    i32.load
                                                                    local.set 27
                                                                    local.get 11
                                                                    i32.load
                                                                    local.set 28
                                                                    local.get 27
                                                                    local.get 28
                                                                    i32.const 4
                                                                    i32.mul
                                                                    i32.add
                                                                    local.set 29
                                                                    local.get 29
                                                                    f32.load
                                                                    local.set 30
                                                                    local.get 30
                                                                    call 0
                                                                    local.set 31
                                                                    local.get 31
                                                                    i32.eqz
                                                                    local.set 32
                                                                    local.get 32
                                                                    if  ;; label = @33
                                                                      i32.const 20
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    else
                                                                      i32.const 21
                                                                      local.set 67
                                                                      br 31 (;@2;)
                                                                    end
                                                                  end
                                                                  i32.const 11
                                                                  local.set 67
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 15
                                                                local.set 67
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 11
                                                              i32.load
                                                              local.set 33
                                                              local.get 33
                                                              i32.const 1
                                                              i32.add
                                                              local.set 34
                                                              local.get 11
                                                              local.get 34
                                                              i32.store
                                                              i32.const 24
                                                              local.set 67
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 35
                                                            local.get 68
                                                            global.set 0
                                                            local.get 35
                                                            return
                                                          end
                                                          i32.const 22
                                                          local.set 67
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 19
                                                        local.set 67
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 22
                                                      local.set 67
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 18
                                                    local.set 67
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 18
                                                  local.set 67
                                                  br 21 (;@2;)
                                                end
                                                i32.const 12
                                                local.set 67
                                                br 20 (;@2;)
                                              end
                                              local.get 68
                                              global.set 0
                                              i32.const 0
                                              return
                                            end
                                            i32.const 27
                                            local.set 67
                                            br 18 (;@2;)
                                          end
                                          local.get 11
                                          i32.load
                                          local.set 36
                                          local.get 5
                                          i32.load
                                          local.set 37
                                          local.get 36
                                          local.get 37
                                          i32.lt_s
                                          local.set 38
                                          local.get 38
                                          if  ;; label = @20
                                            i32.const 33
                                            local.set 67
                                            br 18 (;@2;)
                                          else
                                            i32.const 34
                                            local.set 67
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 28
                                        local.set 67
                                        br 16 (;@2;)
                                      end
                                      i32.const 29
                                      local.set 67
                                      br 15 (;@2;)
                                    end
                                    i32.const 31
                                    local.set 67
                                    br 14 (;@2;)
                                  end
                                  local.get 11
                                  i32.load
                                  local.set 39
                                  local.get 39
                                  i32.const 8
                                  i32.div_s
                                  local.set 40
                                  local.get 12
                                  local.get 40
                                  i32.store
                                  local.get 4
                                  i32.load
                                  local.set 41
                                  local.get 11
                                  i32.load
                                  local.set 42
                                  local.get 41
                                  local.get 42
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 43
                                  local.get 43
                                  f32.load
                                  local.set 44
                                  local.get 12
                                  i32.load
                                  local.set 45
                                  local.get 45
                                  call 2
                                  local.set 46
                                  local.get 44
                                  local.get 46
                                  f32.mul
                                  local.set 47
                                  local.get 14
                                  local.get 47
                                  f32.store
                                  local.get 14
                                  f32.load
                                  local.set 48
                                  i32.const 1
                                  f32.convert_i32_s
                                  local.set 49
                                  local.get 48
                                  local.get 49
                                  f32.div
                                  local.set 50
                                  local.get 16
                                  local.get 50
                                  f32.store
                                  local.get 16
                                  f32.load
                                  local.set 51
                                  local.get 12
                                  i32.load
                                  local.set 52
                                  local.get 52
                                  call 1
                                  local.set 53
                                  local.get 51
                                  local.get 53
                                  f32.add
                                  local.set 54
                                  local.get 18
                                  local.get 54
                                  f32.store
                                  local.get 18
                                  f32.load
                                  local.set 55
                                  local.get 55
                                  call 0
                                  local.set 56
                                  local.get 56
                                  i32.eqz
                                  local.set 57
                                  local.get 57
                                  if  ;; label = @16
                                    i32.const 37
                                    local.set 67
                                    br 14 (;@2;)
                                  else
                                    i32.const 38
                                    local.set 67
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 28
                                local.set 67
                                br 12 (;@2;)
                              end
                              i32.const 32
                              local.set 67
                              br 11 (;@2;)
                            end
                            local.get 18
                            f32.load
                            local.set 58
                            local.get 6
                            i32.load
                            local.set 59
                            local.get 6
                            i32.load
                            local.set 60
                            local.get 11
                            i32.load
                            local.set 61
                            local.get 6
                            i32.load
                            local.set 62
                            local.get 62
                            local.get 61
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 63
                            local.get 63
                            local.get 58
                            f32.store
                            local.get 11
                            i32.load
                            local.set 64
                            local.get 64
                            i32.const 1
                            i32.add
                            local.set 65
                            local.get 11
                            local.get 65
                            i32.store
                            i32.const 41
                            local.set 67
                            br 10 (;@2;)
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 66
                          local.get 68
                          global.set 0
                          local.get 66
                          return
                        end
                        i32.const 39
                        local.set 67
                        br 8 (;@2;)
                      end
                      i32.const 36
                      local.set 67
                      br 7 (;@2;)
                    end
                    i32.const 39
                    local.set 67
                    br 6 (;@2;)
                  end
                  i32.const 35
                  local.set 67
                  br 5 (;@2;)
                end
                i32.const 35
                local.set 67
                br 4 (;@2;)
              end
              i32.const 29
              local.set 67
              br 3 (;@2;)
            end
            i32.const 46
            local.set 67
            br 2 (;@2;)
          end
          i32.const 44
          local.set 67
          br 1 (;@2;)
        end
        i32.const 1
        local.set 67
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 2) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 6
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 5
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                call 5
                local.set 4
                local.get 6
                global.set 0
                local.get 4
                return
              end
              local.get 6
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 5
            br 2 (;@2;)
          end
          i32.const 2
          local.set 5
          br 1 (;@2;)
        end
        i32.const 1
        local.set 5
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 3) (param i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 4
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 3
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.set 2
                local.get 4
                global.set 0
                i32.const 0
                return
              end
              local.get 4
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 3
            br 2 (;@2;)
          end
          i32.const 2
          local.set 3
          br 1 (;@2;)
        end
        i32.const 1
        local.set 3
        br 0 (;@2;)
      end
    end
    unreachable)
  (table (;0;) 8 8 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 65536))
  (global (;1;) (mut i32) (i32.const 196608))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const -1))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (export "memory" (memory 0))
  (export "__hike_sp" (global 0))
  (export "__hike_heap" (global 1))
  (export "Finite" (func 0))
  (export "Mean" (func 1))
  (export "Std" (func 2))
  (export "__hike_impl_NormalizeRawMean" (func 3))
  (export "NormalizeRawMean" (func 4))
  (export "__hike_impl_RestoreRawMean" (func 5))
  (export "RestoreRawMean" (func 6))
  (export "main" (func 7))
  (elem (;0;) (i32.const 0) func 0 1 2 3 4 5 6 7))

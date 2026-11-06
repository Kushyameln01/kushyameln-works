(module
  (type (;0;) (func (param f64) (result f64)))
  (type (;1;) (func (param f64 f64) (result f64)))
  (type (;2;) (func (param f32) (result i32)))
  (type (;3;) (func (param i32 i32) (result i32)))
  (type (;4;) (func (param i32 i32 i32 i32 i32)))
  (type (;5;) (func (param i32 i32 i32 i32 i32) (result i32)))
  (import "env" "cos" (func (;0;) (type 0)))
  (import "env" "sin" (func (;1;) (type 0)))
  (import "env" "pow" (func (;2;) (type 1)))
  (func (;3;) (type 2) (param f32) (result i32)
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
  (func (;4;) (type 3) (param i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 17
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
                                                    local.get 16
                                                    br_table 0 (;@24;) 1 (;@23;) 2 (;@22;) 3 (;@21;) 4 (;@20;) 5 (;@19;) 6 (;@18;) 7 (;@17;) 8 (;@16;) 9 (;@15;) 10 (;@14;) 11 (;@13;) 12 (;@12;) 13 (;@11;) 14 (;@10;) 15 (;@9;) 16 (;@8;) 17 (;@7;) 18 (;@6;) 19 (;@5;) 20 (;@4;) 21 (;@3;) 23 (;@1;)
                                                  end
                                                  global.get 0
                                                  local.set 2
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 2
                                                  local.get 0
                                                  i32.store
                                                  global.get 0
                                                  local.set 3
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 3
                                                  local.get 1
                                                  i32.store
                                                  global.get 0
                                                  local.set 4
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 4
                                                  i32.const 0
                                                  i32.store
                                                  i32.const 4
                                                  local.set 16
                                                  br 21 (;@2;)
                                                end
                                                local.get 17
                                                global.set 0
                                                i32.const 0
                                                return
                                              end
                                              local.get 17
                                              global.set 0
                                              i32.const 1
                                              return
                                            end
                                            i32.const 2
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                          local.get 4
                                          i32.load
                                          local.set 5
                                          local.get 3
                                          i32.load
                                          local.set 6
                                          local.get 5
                                          local.get 6
                                          i32.lt_s
                                          local.set 7
                                          local.get 7
                                          if  ;; label = @20
                                            i32.const 8
                                            local.set 16
                                            br 18 (;@2;)
                                          else
                                            i32.const 9
                                            local.set 16
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 3
                                        local.set 16
                                        br 16 (;@2;)
                                      end
                                      i32.const 4
                                      local.set 16
                                      br 15 (;@2;)
                                    end
                                    i32.const 6
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                  local.get 2
                                  i32.load
                                  local.set 8
                                  local.get 4
                                  i32.load
                                  local.set 9
                                  local.get 8
                                  local.get 9
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 10
                                  local.get 10
                                  f32.load
                                  local.set 11
                                  local.get 11
                                  call 3
                                  local.set 12
                                  local.get 12
                                  i32.eqz
                                  local.set 13
                                  local.get 13
                                  if  ;; label = @16
                                    i32.const 12
                                    local.set 16
                                    br 14 (;@2;)
                                  else
                                    i32.const 13
                                    local.set 16
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 3
                                local.set 16
                                br 12 (;@2;)
                              end
                              i32.const 7
                              local.set 16
                              br 11 (;@2;)
                            end
                            local.get 4
                            i32.load
                            local.set 14
                            local.get 14
                            i32.const 1
                            i32.add
                            local.set 15
                            local.get 4
                            local.get 15
                            i32.store
                            i32.const 16
                            local.set 16
                            br 10 (;@2;)
                          end
                          local.get 17
                          global.set 0
                          i32.const 0
                          return
                        end
                        i32.const 14
                        local.set 16
                        br 8 (;@2;)
                      end
                      i32.const 11
                      local.set 16
                      br 7 (;@2;)
                    end
                    i32.const 14
                    local.set 16
                    br 6 (;@2;)
                  end
                  i32.const 10
                  local.set 16
                  br 5 (;@2;)
                end
                i32.const 10
                local.set 16
                br 4 (;@2;)
              end
              i32.const 4
              local.set 16
              br 3 (;@2;)
            end
            i32.const 21
            local.set 16
            br 2 (;@2;)
          end
          i32.const 19
          local.set 16
          br 1 (;@2;)
        end
        i32.const 1
        local.set 16
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 4) (param i32 i32 i32 i32 i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f64 i32 f64 f64 i32 f64 f64 f64 f64 f64 i32 i32 i32 i32 i32 i32 i32 f32 f64 f64 f64 i32 f64 f64 f32 i32 f64 f64 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f64 f64 f64 i32 f64 f64 f64 f64 f64 i32 i32 i32 i32 i32 f32 f64 f64 f64 i32 f64 f64 f32 i32 f64 f64 f32 i32 f32 f32 f32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 178
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
                                          local.get 177
                                          br_table 0 (;@19;) 1 (;@18;) 2 (;@17;) 3 (;@16;) 4 (;@15;) 5 (;@14;) 6 (;@13;) 7 (;@12;) 8 (;@11;) 9 (;@10;) 10 (;@9;) 11 (;@8;) 12 (;@7;) 13 (;@6;) 14 (;@5;) 15 (;@4;) 16 (;@3;) 18 (;@1;)
                                        end
                                        global.get 0
                                        local.set 5
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 5
                                        local.get 0
                                        i32.store
                                        global.get 0
                                        local.set 6
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 6
                                        local.get 1
                                        i32.store
                                        global.get 0
                                        local.set 7
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 7
                                        local.get 2
                                        i32.store
                                        global.get 0
                                        local.set 8
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 8
                                        local.get 3
                                        i32.store
                                        global.get 0
                                        local.set 9
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 9
                                        local.get 4
                                        i32.store
                                        global.get 0
                                        local.set 10
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 10
                                        i32.const 0
                                        i32.store
                                        local.get 8
                                        i32.load
                                        local.set 11
                                        global.get 0
                                        local.set 12
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 12
                                        local.get 11
                                        i32.store
                                        global.get 0
                                        local.set 13
                                        global.get 0
                                        i32.const 4
                                        i32.add
                                        global.set 0
                                        local.get 13
                                        i32.const 44
                                        i32.store
                                        local.get 8
                                        i32.load
                                        local.set 14
                                        local.get 14
                                        i32.const 22
                                        i32.ge_s
                                        local.set 15
                                        local.get 15
                                        if  ;; label = @19
                                          i32.const 3
                                          local.set 177
                                          br 17 (;@2;)
                                        else
                                          i32.const 4
                                          local.set 177
                                          br 17 (;@2;)
                                        end
                                      end
                                      local.get 178
                                      global.set 0
                                      return
                                    end
                                    local.get 8
                                    i32.load
                                    local.set 16
                                    local.get 16
                                    i32.const 43
                                    i32.ge_s
                                    local.set 17
                                    local.get 17
                                    if  ;; label = @17
                                      i32.const 7
                                      local.set 177
                                      br 15 (;@2;)
                                    else
                                      i32.const 8
                                      local.set 177
                                      br 15 (;@2;)
                                    end
                                  end
                                  local.get 10
                                  i32.const 1
                                  i32.store
                                  local.get 8
                                  i32.load
                                  local.set 18
                                  local.get 18
                                  i32.const 22
                                  i32.sub
                                  local.set 19
                                  local.get 12
                                  local.get 19
                                  i32.store
                                  local.get 13
                                  i32.const 42
                                  i32.store
                                  i32.const 5
                                  local.set 177
                                  br 13 (;@2;)
                                end
                                i32.const 5
                                local.set 177
                                br 12 (;@2;)
                              end
                              i32.const 2
                              local.set 177
                              br 11 (;@2;)
                            end
                            local.get 12
                            i32.load
                            local.set 20
                            i32.const 2
                            local.get 20
                            i32.mul
                            local.set 21
                            local.get 21
                            f64.convert_i32_s
                            local.set 22
                            local.get 13
                            i32.load
                            local.set 23
                            local.get 23
                            f64.convert_i32_s
                            local.set 24
                            local.get 22
                            local.get 24
                            f64.div
                            local.set 25
                            global.get 0
                            local.set 26
                            global.get 0
                            i32.const 8
                            i32.add
                            global.set 0
                            local.get 26
                            local.get 25
                            f64.store
                            i32.const 1
                            f64.convert_i32_s
                            local.set 27
                            i32.const 10000
                            f64.convert_i32_s
                            local.set 28
                            local.get 26
                            f64.load
                            local.set 29
                            local.get 28
                            local.get 29
                            call 2
                            local.set 30
                            local.get 27
                            local.get 30
                            f64.div
                            local.set 31
                            global.get 0
                            local.set 32
                            global.get 0
                            i32.const 8
                            i32.add
                            global.set 0
                            local.get 32
                            local.get 31
                            f64.store
                            local.get 5
                            i32.load
                            local.set 33
                            local.get 7
                            i32.load
                            local.set 34
                            local.get 34
                            i32.const 3
                            i32.mul
                            local.set 35
                            local.get 10
                            i32.load
                            local.set 36
                            local.get 35
                            local.get 36
                            i32.add
                            local.set 37
                            local.get 33
                            local.get 37
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 38
                            local.get 38
                            f32.load
                            local.set 39
                            local.get 39
                            f64.promote_f32
                            local.set 40
                            local.get 32
                            f64.load
                            local.set 41
                            local.get 40
                            local.get 41
                            f64.mul
                            local.set 42
                            global.get 0
                            local.set 43
                            global.get 0
                            i32.const 8
                            i32.add
                            global.set 0
                            local.get 43
                            local.get 42
                            f64.store
                            local.get 43
                            f64.load
                            local.set 44
                            local.get 44
                            call 0
                            local.set 45
                            local.get 45
                            f32.demote_f64
                            local.set 46
                            global.get 0
                            local.set 47
                            global.get 0
                            i32.const 4
                            i32.add
                            global.set 0
                            local.get 47
                            local.get 46
                            f32.store
                            local.get 43
                            f64.load
                            local.set 48
                            local.get 48
                            call 1
                            local.set 49
                            local.get 49
                            f32.demote_f64
                            local.set 50
                            global.get 0
                            local.set 51
                            global.get 0
                            i32.const 4
                            i32.add
                            global.set 0
                            local.get 51
                            local.get 50
                            f32.store
                            local.get 7
                            i32.load
                            local.set 52
                            local.get 52
                            i32.const 64
                            i32.mul
                            local.set 53
                            local.get 8
                            i32.load
                            local.set 54
                            local.get 53
                            local.get 54
                            i32.add
                            local.set 55
                            local.get 55
                            i32.const 4
                            i32.mul
                            local.set 56
                            global.get 0
                            local.set 57
                            global.get 0
                            i32.const 4
                            i32.add
                            global.set 0
                            local.get 57
                            local.get 56
                            i32.store
                            local.get 47
                            f32.load
                            local.set 58
                            local.get 9
                            i32.load
                            local.set 59
                            local.get 9
                            i32.load
                            local.set 60
                            local.get 57
                            i32.load
                            local.set 61
                            local.get 9
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
                            local.get 51
                            f32.load
                            local.set 64
                            f32.const 0x0p+0 (;=0;)
                            local.get 64
                            f32.sub
                            local.set 65
                            local.get 9
                            i32.load
                            local.set 66
                            local.get 9
                            i32.load
                            local.set 67
                            local.get 57
                            i32.load
                            local.set 68
                            local.get 68
                            i32.const 1
                            i32.add
                            local.set 69
                            local.get 9
                            i32.load
                            local.set 70
                            local.get 70
                            local.get 69
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 71
                            local.get 71
                            local.get 65
                            f32.store
                            local.get 51
                            f32.load
                            local.set 72
                            local.get 9
                            i32.load
                            local.set 73
                            local.get 9
                            i32.load
                            local.set 74
                            local.get 57
                            i32.load
                            local.set 75
                            local.get 75
                            i32.const 2
                            i32.add
                            local.set 76
                            local.get 9
                            i32.load
                            local.set 77
                            local.get 77
                            local.get 76
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 78
                            local.get 78
                            local.get 72
                            f32.store
                            local.get 47
                            f32.load
                            local.set 79
                            local.get 9
                            i32.load
                            local.set 80
                            local.get 9
                            i32.load
                            local.set 81
                            local.get 57
                            i32.load
                            local.set 82
                            local.get 82
                            i32.const 3
                            i32.add
                            local.set 83
                            local.get 9
                            i32.load
                            local.set 84
                            local.get 84
                            local.get 83
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 85
                            local.get 85
                            local.get 79
                            f32.store
                            local.get 6
                            i32.load
                            local.set 86
                            local.get 7
                            i32.load
                            local.set 87
                            local.get 86
                            local.get 87
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 88
                            local.get 88
                            i32.load
                            local.set 89
                            local.get 89
                            i32.const 0
                            i32.ne
                            local.set 90
                            local.get 90
                            if  ;; label = @13
                              i32.const 11
                              local.set 177
                              br 11 (;@2;)
                            else
                              i32.const 12
                              local.set 177
                              br 11 (;@2;)
                            end
                          end
                          local.get 10
                          i32.const 2
                          i32.store
                          local.get 8
                          i32.load
                          local.set 91
                          local.get 91
                          i32.const 43
                          i32.sub
                          local.set 92
                          local.get 12
                          local.get 92
                          i32.store
                          local.get 13
                          i32.const 42
                          i32.store
                          i32.const 9
                          local.set 177
                          br 9 (;@2;)
                        end
                        i32.const 9
                        local.set 177
                        br 8 (;@2;)
                      end
                      i32.const 6
                      local.set 177
                      br 7 (;@2;)
                    end
                    local.get 178
                    global.set 0
                    return
                  end
                  local.get 8
                  i32.load
                  local.set 93
                  i32.const 2
                  local.get 93
                  i32.mul
                  local.set 94
                  local.get 94
                  f64.convert_i32_s
                  local.set 95
                  i32.const 128
                  f64.convert_i32_s
                  local.set 96
                  local.get 95
                  local.get 96
                  f64.div
                  local.set 97
                  global.get 0
                  local.set 98
                  global.get 0
                  i32.const 8
                  i32.add
                  global.set 0
                  local.get 98
                  local.get 97
                  f64.store
                  i32.const 1
                  f64.convert_i32_s
                  local.set 99
                  i32.const 10000
                  f64.convert_i32_s
                  local.set 100
                  local.get 98
                  f64.load
                  local.set 101
                  local.get 100
                  local.get 101
                  call 2
                  local.set 102
                  local.get 99
                  local.get 102
                  f64.div
                  local.set 103
                  global.get 0
                  local.set 104
                  global.get 0
                  i32.const 8
                  i32.add
                  global.set 0
                  local.get 104
                  local.get 103
                  f64.store
                  local.get 6
                  i32.load
                  local.set 105
                  local.get 7
                  i32.load
                  local.set 106
                  local.get 105
                  local.get 106
                  i32.const 4
                  i32.mul
                  i32.add
                  local.set 107
                  local.get 107
                  i32.load
                  local.set 108
                  local.get 108
                  f32.convert_i32_s
                  local.set 109
                  local.get 109
                  f64.promote_f32
                  local.set 110
                  local.get 104
                  f64.load
                  local.set 111
                  local.get 110
                  local.get 111
                  f64.mul
                  local.set 112
                  global.get 0
                  local.set 113
                  global.get 0
                  i32.const 8
                  i32.add
                  global.set 0
                  local.get 113
                  local.get 112
                  f64.store
                  local.get 113
                  f64.load
                  local.set 114
                  local.get 114
                  call 0
                  local.set 115
                  local.get 115
                  f32.demote_f64
                  local.set 116
                  global.get 0
                  local.set 117
                  global.get 0
                  i32.const 4
                  i32.add
                  global.set 0
                  local.get 117
                  local.get 116
                  f32.store
                  local.get 113
                  f64.load
                  local.set 118
                  local.get 118
                  call 1
                  local.set 119
                  local.get 119
                  f32.demote_f64
                  local.set 120
                  global.get 0
                  local.set 121
                  global.get 0
                  i32.const 4
                  i32.add
                  global.set 0
                  local.get 121
                  local.get 120
                  f32.store
                  local.get 47
                  f32.load
                  local.set 122
                  local.get 117
                  f32.load
                  local.set 123
                  local.get 122
                  local.get 123
                  f32.mul
                  local.set 124
                  local.get 51
                  f32.load
                  local.set 125
                  f32.const 0x0p+0 (;=0;)
                  local.get 125
                  f32.sub
                  local.set 126
                  local.get 121
                  f32.load
                  local.set 127
                  local.get 126
                  local.get 127
                  f32.mul
                  local.set 128
                  local.get 124
                  local.get 128
                  f32.add
                  local.set 129
                  local.get 9
                  i32.load
                  local.set 130
                  local.get 9
                  i32.load
                  local.set 131
                  local.get 57
                  i32.load
                  local.set 132
                  local.get 9
                  i32.load
                  local.set 133
                  local.get 133
                  local.get 132
                  i32.const 4
                  i32.mul
                  i32.add
                  local.set 134
                  local.get 134
                  local.get 129
                  f32.store
                  local.get 47
                  f32.load
                  local.set 135
                  local.get 121
                  f32.load
                  local.set 136
                  f32.const 0x0p+0 (;=0;)
                  local.get 136
                  f32.sub
                  local.set 137
                  local.get 135
                  local.get 137
                  f32.mul
                  local.set 138
                  local.get 51
                  f32.load
                  local.set 139
                  f32.const 0x0p+0 (;=0;)
                  local.get 139
                  f32.sub
                  local.set 140
                  local.get 117
                  f32.load
                  local.set 141
                  local.get 140
                  local.get 141
                  f32.mul
                  local.set 142
                  local.get 138
                  local.get 142
                  f32.add
                  local.set 143
                  local.get 9
                  i32.load
                  local.set 144
                  local.get 9
                  i32.load
                  local.set 145
                  local.get 57
                  i32.load
                  local.set 146
                  local.get 146
                  i32.const 1
                  i32.add
                  local.set 147
                  local.get 9
                  i32.load
                  local.set 148
                  local.get 148
                  local.get 147
                  i32.const 4
                  i32.mul
                  i32.add
                  local.set 149
                  local.get 149
                  local.get 143
                  f32.store
                  local.get 51
                  f32.load
                  local.set 150
                  local.get 117
                  f32.load
                  local.set 151
                  local.get 150
                  local.get 151
                  f32.mul
                  local.set 152
                  local.get 47
                  f32.load
                  local.set 153
                  local.get 121
                  f32.load
                  local.set 154
                  local.get 153
                  local.get 154
                  f32.mul
                  local.set 155
                  local.get 152
                  local.get 155
                  f32.add
                  local.set 156
                  local.get 9
                  i32.load
                  local.set 157
                  local.get 9
                  i32.load
                  local.set 158
                  local.get 57
                  i32.load
                  local.set 159
                  local.get 159
                  i32.const 2
                  i32.add
                  local.set 160
                  local.get 9
                  i32.load
                  local.set 161
                  local.get 161
                  local.get 160
                  i32.const 4
                  i32.mul
                  i32.add
                  local.set 162
                  local.get 162
                  local.get 156
                  f32.store
                  local.get 51
                  f32.load
                  local.set 163
                  local.get 121
                  f32.load
                  local.set 164
                  f32.const 0x0p+0 (;=0;)
                  local.get 164
                  f32.sub
                  local.set 165
                  local.get 163
                  local.get 165
                  f32.mul
                  local.set 166
                  local.get 47
                  f32.load
                  local.set 167
                  local.get 117
                  f32.load
                  local.set 168
                  local.get 167
                  local.get 168
                  f32.mul
                  local.set 169
                  local.get 166
                  local.get 169
                  f32.add
                  local.set 170
                  local.get 9
                  i32.load
                  local.set 171
                  local.get 9
                  i32.load
                  local.set 172
                  local.get 57
                  i32.load
                  local.set 173
                  local.get 173
                  i32.const 3
                  i32.add
                  local.set 174
                  local.get 9
                  i32.load
                  local.set 175
                  local.get 175
                  local.get 174
                  i32.const 4
                  i32.mul
                  i32.add
                  local.set 176
                  local.get 176
                  local.get 170
                  f32.store
                  i32.const 13
                  local.set 177
                  br 5 (;@2;)
                end
                i32.const 13
                local.set 177
                br 4 (;@2;)
              end
              i32.const 10
              local.set 177
              br 3 (;@2;)
            end
            i32.const 16
            local.set 177
            br 2 (;@2;)
          end
          i32.const 14
          local.set 177
          br 1 (;@2;)
        end
        i32.const 1
        local.set 177
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 5) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 74
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
                                                                                                                                                        local.get 73
                                                                                                                                                        br_table 0 (;@74;) 1 (;@73;) 2 (;@72;) 3 (;@71;) 4 (;@70;) 5 (;@69;) 6 (;@68;) 7 (;@67;) 8 (;@66;) 9 (;@65;) 10 (;@64;) 11 (;@63;) 12 (;@62;) 13 (;@61;) 14 (;@60;) 15 (;@59;) 16 (;@58;) 17 (;@57;) 18 (;@56;) 19 (;@55;) 20 (;@54;) 21 (;@53;) 22 (;@52;) 23 (;@51;) 24 (;@50;) 25 (;@49;) 26 (;@48;) 27 (;@47;) 28 (;@46;) 29 (;@45;) 30 (;@44;) 31 (;@43;) 32 (;@42;) 33 (;@41;) 34 (;@40;) 35 (;@39;) 36 (;@38;) 37 (;@37;) 38 (;@36;) 39 (;@35;) 40 (;@34;) 41 (;@33;) 42 (;@32;) 43 (;@31;) 44 (;@30;) 45 (;@29;) 46 (;@28;) 47 (;@27;) 48 (;@26;) 49 (;@25;) 50 (;@24;) 51 (;@23;) 52 (;@22;) 53 (;@21;) 54 (;@20;) 55 (;@19;) 56 (;@18;) 57 (;@17;) 58 (;@16;) 59 (;@15;) 60 (;@14;) 61 (;@13;) 62 (;@12;) 63 (;@11;) 64 (;@10;) 65 (;@9;) 66 (;@8;) 67 (;@7;) 68 (;@6;) 69 (;@5;) 70 (;@4;) 71 (;@3;) 73 (;@1;)
                                                                                                                                                      end
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 5
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 4
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 5
                                                                                                                                                      local.get 0
                                                                                                                                                      i32.store
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 6
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 4
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 6
                                                                                                                                                      local.get 1
                                                                                                                                                      i32.store
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 7
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 4
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 7
                                                                                                                                                      local.get 2
                                                                                                                                                      i32.store
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 8
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 4
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 8
                                                                                                                                                      local.get 3
                                                                                                                                                      i32.store
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 9
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 4
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 9
                                                                                                                                                      local.get 4
                                                                                                                                                      i32.store
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 10
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 10
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.store8
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 11
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 11
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.store8
                                                                                                                                                      global.get 0
                                                                                                                                                      local.set 12
                                                                                                                                                      global.get 0
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.add
                                                                                                                                                      global.set 0
                                                                                                                                                      local.get 12
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.store8
                                                                                                                                                      local.get 7
                                                                                                                                                      i32.load
                                                                                                                                                      local.set 13
                                                                                                                                                      local.get 13
                                                                                                                                                      i32.const 1
                                                                                                                                                      i32.lt_s
                                                                                                                                                      local.set 14
                                                                                                                                                      local.get 14
                                                                                                                                                      if  ;; label = @74
                                                                                                                                                        i32.const 3
                                                                                                                                                        local.set 73
                                                                                                                                                        br 72 (;@2;)
                                                                                                                                                      else
                                                                                                                                                        i32.const 4
                                                                                                                                                        local.set 73
                                                                                                                                                        br 72 (;@2;)
                                                                                                                                                      end
                                                                                                                                                    end
                                                                                                                                                    local.get 74
                                                                                                                                                    global.set 0
                                                                                                                                                    i32.const 0
                                                                                                                                                    return
                                                                                                                                                  end
                                                                                                                                                  local.get 5
                                                                                                                                                  i32.load
                                                                                                                                                  local.set 15
                                                                                                                                                  local.get 7
                                                                                                                                                  i32.load
                                                                                                                                                  local.set 16
                                                                                                                                                  local.get 16
                                                                                                                                                  i32.const 3
                                                                                                                                                  i32.mul
                                                                                                                                                  local.set 17
                                                                                                                                                  local.get 15
                                                                                                                                                  local.get 17
                                                                                                                                                  call 4
                                                                                                                                                  local.set 18
                                                                                                                                                  local.get 18
                                                                                                                                                  i32.eqz
                                                                                                                                                  local.set 19
                                                                                                                                                  local.get 19
                                                                                                                                                  if  ;; label = @72
                                                                                                                                                    i32.const 17
                                                                                                                                                    local.set 73
                                                                                                                                                    br 70 (;@2;)
                                                                                                                                                  else
                                                                                                                                                    i32.const 18
                                                                                                                                                    local.set 73
                                                                                                                                                    br 70 (;@2;)
                                                                                                                                                  end
                                                                                                                                                end
                                                                                                                                                i32.const 5
                                                                                                                                                local.set 73
                                                                                                                                                br 68 (;@2;)
                                                                                                                                              end
                                                                                                                                              local.get 7
                                                                                                                                              i32.load
                                                                                                                                              local.set 20
                                                                                                                                              local.get 20
                                                                                                                                              i32.const 16
                                                                                                                                              i32.gt_s
                                                                                                                                              local.set 21
                                                                                                                                              local.get 12
                                                                                                                                              local.get 21
                                                                                                                                              i32.store8
                                                                                                                                              i32.const 5
                                                                                                                                              local.set 73
                                                                                                                                              br 67 (;@2;)
                                                                                                                                            end
                                                                                                                                            local.get 12
                                                                                                                                            i32.load8_u
                                                                                                                                            local.set 22
                                                                                                                                            local.get 22
                                                                                                                                            if  ;; label = @69
                                                                                                                                              i32.const 6
                                                                                                                                              local.set 73
                                                                                                                                              br 67 (;@2;)
                                                                                                                                            else
                                                                                                                                              i32.const 7
                                                                                                                                              local.set 73
                                                                                                                                              br 67 (;@2;)
                                                                                                                                            end
                                                                                                                                          end
                                                                                                                                          i32.const 8
                                                                                                                                          local.set 73
                                                                                                                                          br 65 (;@2;)
                                                                                                                                        end
                                                                                                                                        local.get 9
                                                                                                                                        i32.load
                                                                                                                                        local.set 23
                                                                                                                                        local.get 7
                                                                                                                                        i32.load
                                                                                                                                        local.set 24
                                                                                                                                        local.get 24
                                                                                                                                        i32.const 256
                                                                                                                                        i32.mul
                                                                                                                                        local.set 25
                                                                                                                                        local.get 23
                                                                                                                                        local.get 25
                                                                                                                                        i32.lt_s
                                                                                                                                        local.set 26
                                                                                                                                        local.get 11
                                                                                                                                        local.get 26
                                                                                                                                        i32.store8
                                                                                                                                        i32.const 8
                                                                                                                                        local.set 73
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                      local.get 11
                                                                                                                                      i32.load8_u
                                                                                                                                      local.set 27
                                                                                                                                      local.get 27
                                                                                                                                      if  ;; label = @66
                                                                                                                                        i32.const 9
                                                                                                                                        local.set 73
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      else
                                                                                                                                        i32.const 10
                                                                                                                                        local.set 73
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                    end
                                                                                                                                    i32.const 11
                                                                                                                                    local.set 73
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  end
                                                                                                                                  local.get 9
                                                                                                                                  i32.load
                                                                                                                                  local.set 28
                                                                                                                                  local.get 28
                                                                                                                                  i32.const 4096
                                                                                                                                  i32.gt_s
                                                                                                                                  local.set 29
                                                                                                                                  local.get 10
                                                                                                                                  local.get 29
                                                                                                                                  i32.store8
                                                                                                                                  i32.const 11
                                                                                                                                  local.set 73
                                                                                                                                  br 61 (;@2;)
                                                                                                                                end
                                                                                                                                local.get 10
                                                                                                                                i32.load8_u
                                                                                                                                local.set 30
                                                                                                                                local.get 30
                                                                                                                                if  ;; label = @63
                                                                                                                                  i32.const 12
                                                                                                                                  local.set 73
                                                                                                                                  br 61 (;@2;)
                                                                                                                                else
                                                                                                                                  i32.const 13
                                                                                                                                  local.set 73
                                                                                                                                  br 61 (;@2;)
                                                                                                                                end
                                                                                                                              end
                                                                                                                              i32.const 0
                                                                                                                              i32.const 1
                                                                                                                              i32.sub
                                                                                                                              local.set 31
                                                                                                                              local.get 74
                                                                                                                              global.set 0
                                                                                                                              local.get 31
                                                                                                                              return
                                                                                                                            end
                                                                                                                            i32.const 14
                                                                                                                            local.set 73
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                          i32.const 2
                                                                                                                          local.set 73
                                                                                                                          br 57 (;@2;)
                                                                                                                        end
                                                                                                                        i32.const 14
                                                                                                                        local.set 73
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                      global.get 0
                                                                                                                      local.set 32
                                                                                                                      global.get 0
                                                                                                                      i32.const 4
                                                                                                                      i32.add
                                                                                                                      global.set 0
                                                                                                                      local.get 32
                                                                                                                      i32.const 0
                                                                                                                      i32.store
                                                                                                                      global.get 0
                                                                                                                      local.set 33
                                                                                                                      global.get 0
                                                                                                                      i32.const 4
                                                                                                                      i32.add
                                                                                                                      global.set 0
                                                                                                                      local.get 33
                                                                                                                      i32.const 0
                                                                                                                      i32.store
                                                                                                                      i32.const 23
                                                                                                                      local.set 73
                                                                                                                      br 55 (;@2;)
                                                                                                                    end
                                                                                                                    i32.const 0
                                                                                                                    i32.const 2
                                                                                                                    i32.sub
                                                                                                                    local.set 34
                                                                                                                    local.get 74
                                                                                                                    global.set 0
                                                                                                                    local.get 34
                                                                                                                    return
                                                                                                                  end
                                                                                                                  i32.const 19
                                                                                                                  local.set 73
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                i32.const 16
                                                                                                                local.set 73
                                                                                                                br 52 (;@2;)
                                                                                                              end
                                                                                                              i32.const 19
                                                                                                              local.set 73
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            local.get 32
                                                                                                            i32.const 0
                                                                                                            i32.store
                                                                                                            i32.const 43
                                                                                                            local.set 73
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 21
                                                                                                          local.set 73
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        local.get 32
                                                                                                        i32.load
                                                                                                        local.set 35
                                                                                                        local.get 7
                                                                                                        i32.load
                                                                                                        local.set 36
                                                                                                        local.get 35
                                                                                                        local.get 36
                                                                                                        i32.lt_s
                                                                                                        local.set 37
                                                                                                        local.get 37
                                                                                                        if  ;; label = @51
                                                                                                          i32.const 27
                                                                                                          local.set 73
                                                                                                          br 49 (;@2;)
                                                                                                        else
                                                                                                          i32.const 28
                                                                                                          local.set 73
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                      end
                                                                                                      i32.const 22
                                                                                                      local.set 73
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    i32.const 23
                                                                                                    local.set 73
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  i32.const 25
                                                                                                  local.set 73
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 38
                                                                                                global.get 0
                                                                                                i32.const 1
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 38
                                                                                                i32.const 1
                                                                                                i32.store8
                                                                                                local.get 6
                                                                                                i32.load
                                                                                                local.set 39
                                                                                                local.get 32
                                                                                                i32.load
                                                                                                local.set 40
                                                                                                local.get 39
                                                                                                local.get 40
                                                                                                i32.const 4
                                                                                                i32.mul
                                                                                                i32.add
                                                                                                local.set 41
                                                                                                local.get 41
                                                                                                i32.load
                                                                                                local.set 42
                                                                                                local.get 42
                                                                                                i32.const 0
                                                                                                i32.lt_s
                                                                                                local.set 43
                                                                                                local.get 43
                                                                                                if  ;; label = @47
                                                                                                  i32.const 31
                                                                                                  local.set 73
                                                                                                  br 45 (;@2;)
                                                                                                else
                                                                                                  i32.const 32
                                                                                                  local.set 73
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                              end
                                                                                              i32.const 22
                                                                                              local.set 73
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            i32.const 26
                                                                                            local.set 73
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 32
                                                                                          i32.load
                                                                                          local.set 44
                                                                                          local.get 44
                                                                                          i32.const 1
                                                                                          i32.add
                                                                                          local.set 45
                                                                                          local.get 32
                                                                                          local.get 45
                                                                                          i32.store
                                                                                          i32.const 38
                                                                                          local.set 73
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 33
                                                                                        local.set 73
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 6
                                                                                      i32.load
                                                                                      local.set 46
                                                                                      local.get 32
                                                                                      i32.load
                                                                                      local.set 47
                                                                                      local.get 46
                                                                                      local.get 47
                                                                                      i32.const 4
                                                                                      i32.mul
                                                                                      i32.add
                                                                                      local.set 48
                                                                                      local.get 48
                                                                                      i32.load
                                                                                      local.set 49
                                                                                      local.get 49
                                                                                      i32.const 16777216
                                                                                      i32.gt_s
                                                                                      local.set 50
                                                                                      local.get 38
                                                                                      local.get 50
                                                                                      i32.store8
                                                                                      i32.const 33
                                                                                      local.set 73
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    local.get 38
                                                                                    i32.load8_u
                                                                                    local.set 51
                                                                                    local.get 51
                                                                                    if  ;; label = @41
                                                                                      i32.const 34
                                                                                      local.set 73
                                                                                      br 39 (;@2;)
                                                                                    else
                                                                                      i32.const 35
                                                                                      local.set 73
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                  end
                                                                                  i32.const 0
                                                                                  i32.const 2
                                                                                  i32.sub
                                                                                  local.set 52
                                                                                  local.get 74
                                                                                  global.set 0
                                                                                  local.get 52
                                                                                  return
                                                                                end
                                                                                i32.const 36
                                                                                local.set 73
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 30
                                                                              local.set 73
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 36
                                                                            local.set 73
                                                                            br 34 (;@2;)
                                                                          end
                                                                          i32.const 29
                                                                          local.set 73
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 29
                                                                        local.set 73
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 23
                                                                      local.set 73
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 8
                                                                    i32.load
                                                                    local.set 53
                                                                    local.get 7
                                                                    i32.load
                                                                    local.set 54
                                                                    local.get 54
                                                                    i32.const 256
                                                                    i32.mul
                                                                    local.set 55
                                                                    local.get 53
                                                                    local.get 55
                                                                    call 4
                                                                    local.set 56
                                                                    local.get 56
                                                                    i32.eqz
                                                                    local.set 57
                                                                    local.get 57
                                                                    if  ;; label = @33
                                                                      i32.const 65
                                                                      local.set 73
                                                                      br 31 (;@2;)
                                                                    else
                                                                      i32.const 66
                                                                      local.set 73
                                                                      br 31 (;@2;)
                                                                    end
                                                                  end
                                                                  i32.const 41
                                                                  local.set 73
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 32
                                                                i32.load
                                                                local.set 58
                                                                local.get 7
                                                                i32.load
                                                                local.set 59
                                                                local.get 58
                                                                local.get 59
                                                                i32.lt_s
                                                                local.set 60
                                                                local.get 60
                                                                if  ;; label = @31
                                                                  i32.const 47
                                                                  local.set 73
                                                                  br 29 (;@2;)
                                                                else
                                                                  i32.const 48
                                                                  local.set 73
                                                                  br 29 (;@2;)
                                                                end
                                                              end
                                                              i32.const 42
                                                              local.set 73
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 43
                                                            local.set 73
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 45
                                                          local.set 73
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 33
                                                        i32.const 0
                                                        i32.store
                                                        i32.const 52
                                                        local.set 73
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 42
                                                      local.set 73
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 46
                                                    local.set 73
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 32
                                                  i32.load
                                                  local.set 61
                                                  local.get 61
                                                  i32.const 1
                                                  i32.add
                                                  local.set 62
                                                  local.get 32
                                                  local.get 62
                                                  i32.store
                                                  i32.const 61
                                                  local.set 73
                                                  br 21 (;@2;)
                                                end
                                                i32.const 50
                                                local.set 73
                                                br 20 (;@2;)
                                              end
                                              local.get 33
                                              i32.load
                                              local.set 63
                                              local.get 63
                                              i32.const 64
                                              i32.lt_s
                                              local.set 64
                                              local.get 64
                                              if  ;; label = @22
                                                i32.const 56
                                                local.set 73
                                                br 20 (;@2;)
                                              else
                                                i32.const 57
                                                local.set 73
                                                br 20 (;@2;)
                                              end
                                            end
                                            i32.const 51
                                            local.set 73
                                            br 18 (;@2;)
                                          end
                                          i32.const 52
                                          local.set 73
                                          br 17 (;@2;)
                                        end
                                        i32.const 54
                                        local.set 73
                                        br 16 (;@2;)
                                      end
                                      local.get 5
                                      i32.load
                                      local.set 65
                                      local.get 6
                                      i32.load
                                      local.set 66
                                      local.get 32
                                      i32.load
                                      local.set 67
                                      local.get 33
                                      i32.load
                                      local.set 68
                                      local.get 8
                                      i32.load
                                      local.set 69
                                      local.get 65
                                      local.get 66
                                      local.get 67
                                      local.get 68
                                      local.get 69
                                      call 5
                                      local.get 33
                                      i32.load
                                      local.set 70
                                      local.get 70
                                      i32.const 1
                                      i32.add
                                      local.set 71
                                      local.get 33
                                      local.get 71
                                      i32.store
                                      i32.const 58
                                      local.set 73
                                      br 15 (;@2;)
                                    end
                                    i32.const 51
                                    local.set 73
                                    br 14 (;@2;)
                                  end
                                  i32.const 55
                                  local.set 73
                                  br 13 (;@2;)
                                end
                                i32.const 58
                                local.set 73
                                br 12 (;@2;)
                              end
                              i32.const 52
                              local.set 73
                              br 11 (;@2;)
                            end
                            i32.const 49
                            local.set 73
                            br 10 (;@2;)
                          end
                          i32.const 49
                          local.set 73
                          br 9 (;@2;)
                        end
                        i32.const 43
                        local.set 73
                        br 8 (;@2;)
                      end
                      local.get 74
                      global.set 0
                      i32.const 0
                      return
                    end
                    i32.const 0
                    i32.const 3
                    i32.sub
                    local.set 72
                    local.get 74
                    global.set 0
                    local.get 72
                    return
                  end
                  i32.const 67
                  local.set 73
                  br 5 (;@2;)
                end
                i32.const 64
                local.set 73
                br 4 (;@2;)
              end
              i32.const 67
              local.set 73
              br 3 (;@2;)
            end
            i32.const 71
            local.set 73
            br 2 (;@2;)
          end
          i32.const 69
          local.set 73
          br 1 (;@2;)
        end
        i32.const 1
        local.set 73
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 5) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 7
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 6
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                call 6
                local.set 5
                local.get 7
                global.set 0
                local.get 5
                return
              end
              local.get 7
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 6
            br 2 (;@2;)
          end
          i32.const 2
          local.set 6
          br 1 (;@2;)
        end
        i32.const 1
        local.set 6
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;8;) (type 5) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 f32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 124
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
                                                                                                      local.get 123
                                                                                                      br_table 0 (;@49;) 1 (;@48;) 2 (;@47;) 3 (;@46;) 4 (;@45;) 5 (;@44;) 6 (;@43;) 7 (;@42;) 8 (;@41;) 9 (;@40;) 10 (;@39;) 11 (;@38;) 12 (;@37;) 13 (;@36;) 14 (;@35;) 15 (;@34;) 16 (;@33;) 17 (;@32;) 18 (;@31;) 19 (;@30;) 20 (;@29;) 21 (;@28;) 22 (;@27;) 23 (;@26;) 24 (;@25;) 25 (;@24;) 26 (;@23;) 27 (;@22;) 28 (;@21;) 29 (;@20;) 30 (;@19;) 31 (;@18;) 32 (;@17;) 33 (;@16;) 34 (;@15;) 35 (;@14;) 36 (;@13;) 37 (;@12;) 38 (;@11;) 39 (;@10;) 40 (;@9;) 41 (;@8;) 42 (;@7;) 43 (;@6;) 44 (;@5;) 45 (;@4;) 46 (;@3;) 48 (;@1;)
                                                                                                    end
                                                                                                    global.get 0
                                                                                                    local.set 5
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 5
                                                                                                    local.get 0
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 6
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 6
                                                                                                    local.get 1
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 7
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 7
                                                                                                    local.get 2
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 8
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 8
                                                                                                    local.get 3
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 9
                                                                                                    global.get 0
                                                                                                    i32.const 4
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 9
                                                                                                    local.get 4
                                                                                                    i32.store
                                                                                                    global.get 0
                                                                                                    local.set 10
                                                                                                    global.get 0
                                                                                                    i32.const 1
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 10
                                                                                                    i32.const 1
                                                                                                    i32.store8
                                                                                                    global.get 0
                                                                                                    local.set 11
                                                                                                    global.get 0
                                                                                                    i32.const 1
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 11
                                                                                                    i32.const 1
                                                                                                    i32.store8
                                                                                                    global.get 0
                                                                                                    local.set 12
                                                                                                    global.get 0
                                                                                                    i32.const 1
                                                                                                    i32.add
                                                                                                    global.set 0
                                                                                                    local.get 12
                                                                                                    i32.const 1
                                                                                                    i32.store8
                                                                                                    local.get 7
                                                                                                    i32.load
                                                                                                    local.set 13
                                                                                                    local.get 13
                                                                                                    i32.const 1
                                                                                                    i32.lt_s
                                                                                                    local.set 14
                                                                                                    local.get 14
                                                                                                    if  ;; label = @49
                                                                                                      i32.const 3
                                                                                                      local.set 123
                                                                                                      br 47 (;@2;)
                                                                                                    else
                                                                                                      i32.const 4
                                                                                                      local.set 123
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                  end
                                                                                                  local.get 124
                                                                                                  global.set 0
                                                                                                  i32.const 0
                                                                                                  return
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 15
                                                                                                global.get 0
                                                                                                i32.const 1
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 15
                                                                                                i32.const 1
                                                                                                i32.store8
                                                                                                local.get 5
                                                                                                i32.load
                                                                                                local.set 16
                                                                                                local.get 7
                                                                                                i32.load
                                                                                                local.set 17
                                                                                                local.get 17
                                                                                                i32.const 128
                                                                                                i32.mul
                                                                                                local.set 18
                                                                                                local.get 16
                                                                                                local.get 18
                                                                                                call 4
                                                                                                local.set 19
                                                                                                local.get 19
                                                                                                i32.eqz
                                                                                                local.set 20
                                                                                                local.get 20
                                                                                                if  ;; label = @47
                                                                                                  i32.const 17
                                                                                                  local.set 123
                                                                                                  br 45 (;@2;)
                                                                                                else
                                                                                                  i32.const 18
                                                                                                  local.set 123
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                              end
                                                                                              i32.const 5
                                                                                              local.set 123
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 7
                                                                                            i32.load
                                                                                            local.set 21
                                                                                            local.get 21
                                                                                            i32.const 16
                                                                                            i32.gt_s
                                                                                            local.set 22
                                                                                            local.get 12
                                                                                            local.get 22
                                                                                            i32.store8
                                                                                            i32.const 5
                                                                                            local.set 123
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 12
                                                                                          i32.load8_u
                                                                                          local.set 23
                                                                                          local.get 23
                                                                                          if  ;; label = @44
                                                                                            i32.const 6
                                                                                            local.set 123
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 7
                                                                                            local.set 123
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 8
                                                                                        local.set 123
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 9
                                                                                      i32.load
                                                                                      local.set 24
                                                                                      local.get 7
                                                                                      i32.load
                                                                                      local.set 25
                                                                                      local.get 25
                                                                                      i32.const 128
                                                                                      i32.mul
                                                                                      local.set 26
                                                                                      local.get 24
                                                                                      local.get 26
                                                                                      i32.lt_s
                                                                                      local.set 27
                                                                                      local.get 11
                                                                                      local.get 27
                                                                                      i32.store8
                                                                                      i32.const 8
                                                                                      local.set 123
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    local.get 11
                                                                                    i32.load8_u
                                                                                    local.set 28
                                                                                    local.get 28
                                                                                    if  ;; label = @41
                                                                                      i32.const 9
                                                                                      local.set 123
                                                                                      br 39 (;@2;)
                                                                                    else
                                                                                      i32.const 10
                                                                                      local.set 123
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                  end
                                                                                  i32.const 11
                                                                                  local.set 123
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 9
                                                                                i32.load
                                                                                local.set 29
                                                                                local.get 29
                                                                                i32.const 2048
                                                                                i32.gt_s
                                                                                local.set 30
                                                                                local.get 10
                                                                                local.get 30
                                                                                i32.store8
                                                                                i32.const 11
                                                                                local.set 123
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 10
                                                                              i32.load8_u
                                                                              local.set 31
                                                                              local.get 31
                                                                              if  ;; label = @38
                                                                                i32.const 12
                                                                                local.set 123
                                                                                br 36 (;@2;)
                                                                              else
                                                                                i32.const 13
                                                                                local.set 123
                                                                                br 36 (;@2;)
                                                                              end
                                                                            end
                                                                            i32.const 0
                                                                            i32.const 1
                                                                            i32.sub
                                                                            local.set 32
                                                                            local.get 124
                                                                            global.set 0
                                                                            local.get 32
                                                                            return
                                                                          end
                                                                          i32.const 14
                                                                          local.set 123
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 2
                                                                        local.set 123
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 14
                                                                      local.set 123
                                                                      br 31 (;@2;)
                                                                    end
                                                                    global.get 0
                                                                    local.set 33
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 33
                                                                    i32.const 0
                                                                    i32.store
                                                                    i32.const 0
                                                                    f32.convert_i32_s
                                                                    local.set 34
                                                                    global.get 0
                                                                    local.set 35
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 35
                                                                    local.get 34
                                                                    f32.store
                                                                    i32.const 0
                                                                    f32.convert_i32_s
                                                                    local.set 36
                                                                    global.get 0
                                                                    local.set 37
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 37
                                                                    local.get 36
                                                                    f32.store
                                                                    i32.const 0
                                                                    f32.convert_i32_s
                                                                    local.set 38
                                                                    global.get 0
                                                                    local.set 39
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 39
                                                                    local.get 38
                                                                    f32.store
                                                                    i32.const 0
                                                                    f32.convert_i32_s
                                                                    local.set 40
                                                                    global.get 0
                                                                    local.set 41
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 41
                                                                    local.get 40
                                                                    f32.store
                                                                    i32.const 26
                                                                    local.set 123
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 19
                                                                  local.set 123
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 6
                                                                i32.load
                                                                local.set 42
                                                                local.get 7
                                                                i32.load
                                                                local.set 43
                                                                local.get 43
                                                                i32.const 256
                                                                i32.mul
                                                                local.set 44
                                                                local.get 42
                                                                local.get 44
                                                                call 4
                                                                local.set 45
                                                                local.get 45
                                                                i32.eqz
                                                                local.set 46
                                                                local.get 15
                                                                local.get 46
                                                                i32.store8
                                                                i32.const 19
                                                                local.set 123
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 15
                                                              i32.load8_u
                                                              local.set 47
                                                              local.get 47
                                                              if  ;; label = @30
                                                                i32.const 20
                                                                local.set 123
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 21
                                                                local.set 123
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 48
                                                            local.get 124
                                                            global.set 0
                                                            local.get 48
                                                            return
                                                          end
                                                          i32.const 22
                                                          local.set 123
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 16
                                                        local.set 123
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 22
                                                      local.set 123
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 124
                                                    global.set 0
                                                    i32.const 0
                                                    return
                                                  end
                                                  i32.const 24
                                                  local.set 123
                                                  br 21 (;@2;)
                                                end
                                                local.get 33
                                                i32.load
                                                local.set 49
                                                local.get 7
                                                i32.load
                                                local.set 50
                                                local.get 50
                                                i32.const 64
                                                i32.mul
                                                local.set 51
                                                local.get 49
                                                local.get 51
                                                i32.lt_s
                                                local.set 52
                                                local.get 52
                                                if  ;; label = @23
                                                  i32.const 30
                                                  local.set 123
                                                  br 21 (;@2;)
                                                else
                                                  i32.const 31
                                                  local.set 123
                                                  br 21 (;@2;)
                                                end
                                              end
                                              i32.const 25
                                              local.set 123
                                              br 19 (;@2;)
                                            end
                                            i32.const 26
                                            local.set 123
                                            br 18 (;@2;)
                                          end
                                          i32.const 28
                                          local.set 123
                                          br 17 (;@2;)
                                        end
                                        local.get 5
                                        i32.load
                                        local.set 53
                                        local.get 33
                                        i32.load
                                        local.set 54
                                        local.get 54
                                        i32.const 2
                                        i32.mul
                                        local.set 55
                                        local.get 53
                                        local.get 55
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 56
                                        local.get 56
                                        f32.load
                                        local.set 57
                                        local.get 35
                                        local.get 57
                                        f32.store
                                        local.get 5
                                        i32.load
                                        local.set 58
                                        local.get 33
                                        i32.load
                                        local.set 59
                                        local.get 59
                                        i32.const 2
                                        i32.mul
                                        local.set 60
                                        local.get 60
                                        i32.const 1
                                        i32.add
                                        local.set 61
                                        local.get 58
                                        local.get 61
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 62
                                        local.get 62
                                        f32.load
                                        local.set 63
                                        local.get 37
                                        local.get 63
                                        f32.store
                                        local.get 6
                                        i32.load
                                        local.set 64
                                        local.get 33
                                        i32.load
                                        local.set 65
                                        local.get 65
                                        i32.const 4
                                        i32.mul
                                        local.set 66
                                        local.get 64
                                        local.get 66
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 67
                                        local.get 67
                                        f32.load
                                        local.set 68
                                        local.get 35
                                        f32.load
                                        local.set 69
                                        local.get 68
                                        local.get 69
                                        f32.mul
                                        local.set 70
                                        local.get 6
                                        i32.load
                                        local.set 71
                                        local.get 33
                                        i32.load
                                        local.set 72
                                        local.get 72
                                        i32.const 4
                                        i32.mul
                                        local.set 73
                                        local.get 73
                                        i32.const 1
                                        i32.add
                                        local.set 74
                                        local.get 71
                                        local.get 74
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 75
                                        local.get 75
                                        f32.load
                                        local.set 76
                                        local.get 37
                                        f32.load
                                        local.set 77
                                        local.get 76
                                        local.get 77
                                        f32.mul
                                        local.set 78
                                        local.get 70
                                        local.get 78
                                        f32.add
                                        local.set 79
                                        local.get 39
                                        local.get 79
                                        f32.store
                                        local.get 6
                                        i32.load
                                        local.set 80
                                        local.get 33
                                        i32.load
                                        local.set 81
                                        local.get 81
                                        i32.const 4
                                        i32.mul
                                        local.set 82
                                        local.get 82
                                        i32.const 2
                                        i32.add
                                        local.set 83
                                        local.get 80
                                        local.get 83
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 84
                                        local.get 84
                                        f32.load
                                        local.set 85
                                        local.get 35
                                        f32.load
                                        local.set 86
                                        local.get 85
                                        local.get 86
                                        f32.mul
                                        local.set 87
                                        local.get 6
                                        i32.load
                                        local.set 88
                                        local.get 33
                                        i32.load
                                        local.set 89
                                        local.get 89
                                        i32.const 4
                                        i32.mul
                                        local.set 90
                                        local.get 90
                                        i32.const 3
                                        i32.add
                                        local.set 91
                                        local.get 88
                                        local.get 91
                                        i32.const 4
                                        i32.mul
                                        i32.add
                                        local.set 92
                                        local.get 92
                                        f32.load
                                        local.set 93
                                        local.get 37
                                        f32.load
                                        local.set 94
                                        local.get 93
                                        local.get 94
                                        f32.mul
                                        local.set 95
                                        local.get 87
                                        local.get 95
                                        f32.add
                                        local.set 96
                                        local.get 41
                                        local.get 96
                                        f32.store
                                        global.get 0
                                        local.set 97
                                        global.get 0
                                        i32.const 1
                                        i32.add
                                        global.set 0
                                        local.get 97
                                        i32.const 1
                                        i32.store8
                                        local.get 39
                                        f32.load
                                        local.set 98
                                        local.get 98
                                        call 3
                                        local.set 99
                                        local.get 99
                                        i32.eqz
                                        local.set 100
                                        local.get 100
                                        if  ;; label = @19
                                          i32.const 34
                                          local.set 123
                                          br 17 (;@2;)
                                        else
                                          i32.const 35
                                          local.set 123
                                          br 17 (;@2;)
                                        end
                                      end
                                      i32.const 25
                                      local.set 123
                                      br 15 (;@2;)
                                    end
                                    i32.const 29
                                    local.set 123
                                    br 14 (;@2;)
                                  end
                                  local.get 39
                                  f32.load
                                  local.set 101
                                  local.get 8
                                  i32.load
                                  local.set 102
                                  local.get 8
                                  i32.load
                                  local.set 103
                                  local.get 33
                                  i32.load
                                  local.set 104
                                  local.get 104
                                  i32.const 2
                                  i32.mul
                                  local.set 105
                                  local.get 8
                                  i32.load
                                  local.set 106
                                  local.get 106
                                  local.get 105
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 107
                                  local.get 107
                                  local.get 101
                                  f32.store
                                  local.get 41
                                  f32.load
                                  local.set 108
                                  local.get 8
                                  i32.load
                                  local.set 109
                                  local.get 8
                                  i32.load
                                  local.set 110
                                  local.get 33
                                  i32.load
                                  local.set 111
                                  local.get 111
                                  i32.const 2
                                  i32.mul
                                  local.set 112
                                  local.get 112
                                  i32.const 1
                                  i32.add
                                  local.set 113
                                  local.get 8
                                  i32.load
                                  local.set 114
                                  local.get 114
                                  local.get 113
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 115
                                  local.get 115
                                  local.get 108
                                  f32.store
                                  local.get 33
                                  i32.load
                                  local.set 116
                                  local.get 116
                                  i32.const 1
                                  i32.add
                                  local.set 117
                                  local.get 33
                                  local.get 117
                                  i32.store
                                  i32.const 41
                                  local.set 123
                                  br 13 (;@2;)
                                end
                                i32.const 36
                                local.set 123
                                br 12 (;@2;)
                              end
                              local.get 41
                              f32.load
                              local.set 118
                              local.get 118
                              call 3
                              local.set 119
                              local.get 119
                              i32.eqz
                              local.set 120
                              local.get 97
                              local.get 120
                              i32.store8
                              i32.const 36
                              local.set 123
                              br 11 (;@2;)
                            end
                            local.get 97
                            i32.load8_u
                            local.set 121
                            local.get 121
                            if  ;; label = @13
                              i32.const 37
                              local.set 123
                              br 11 (;@2;)
                            else
                              i32.const 38
                              local.set 123
                              br 11 (;@2;)
                            end
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 122
                          local.get 124
                          global.set 0
                          local.get 122
                          return
                        end
                        i32.const 39
                        local.set 123
                        br 8 (;@2;)
                      end
                      i32.const 33
                      local.set 123
                      br 7 (;@2;)
                    end
                    i32.const 39
                    local.set 123
                    br 6 (;@2;)
                  end
                  i32.const 32
                  local.set 123
                  br 5 (;@2;)
                end
                i32.const 32
                local.set 123
                br 4 (;@2;)
              end
              i32.const 26
              local.set 123
              br 3 (;@2;)
            end
            i32.const 46
            local.set 123
            br 2 (;@2;)
          end
          i32.const 44
          local.set 123
          br 1 (;@2;)
        end
        i32.const 1
        local.set 123
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;9;) (type 5) (param i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 7
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 6
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                call 8
                local.set 5
                local.get 7
                global.set 0
                local.get 5
                return
              end
              local.get 7
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 6
            br 2 (;@2;)
          end
          i32.const 2
          local.set 6
          br 1 (;@2;)
        end
        i32.const 1
        local.set 6
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;10;) (type 3) (param i32 i32) (result i32)
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
  (export "Finite" (func 3))
  (export "FiniteValues" (func 4))
  (export "BuildPair" (func 5))
  (export "__hike_impl_Build" (func 6))
  (export "Build" (func 7))
  (export "__hike_impl_Apply" (func 8))
  (export "Apply" (func 9))
  (export "main" (func 10))
  (elem (;0;) (i32.const 0) func 3 4 5 6 7 8 9 10))
